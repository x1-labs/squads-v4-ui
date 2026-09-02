import { PublicKey } from '@solana/web3.js';
import type { AddressLookupTableAccount, TransactionInstruction } from '@solana/web3.js';
import { Button } from './ui/button';
import * as multisig from '@sqds/multisig';
import { useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { toast } from 'sonner';
import { Dialog, DialogDescription, DialogHeader } from './ui/dialog';
import { DialogTrigger } from './ui/dialog';
import { DialogContent, DialogTitle } from './ui/dialog';
import { useEffect, useState } from 'react';
import { AlertCircle } from 'lucide-react';
import { Input } from './ui/input';
import { range } from '@/lib/utils';
import { useMultisigData } from '@/hooks/useMultisigData';
import { useQueryClient } from '@tanstack/react-query';
import { getPriorityFeeMicroLamports } from '../lib/transaction/priorityFee';
import { describeSendError, signSendAndConfirmV0 } from '../lib/transaction/signSendAndConfirm';
import { toastSteps } from '../lib/transaction/toastSteps';

/** One execute to send: the instruction plus the lookup tables it needs to fit. */
type Execute = {
  instructions: TransactionInstruction[];
  lookupTableAccounts?: AddressLookupTableAccount[];
};

type ExecuteButtonProps = {
  multisigPda: string;
  transactionIndex: number;
  proposalStatus: string;
  programId: string;
};

const ExecuteButton = ({
  multisigPda,
  transactionIndex,
  proposalStatus,
  programId,
}: ExecuteButtonProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const closeDialog = () => {
    setIsOpen(false);
    setErrorMessage(null);
    setPriorityFeeEdited(false);
  };
  const wallet = useWallet();
  const walletModal = useWalletModal();
  const [priorityFeeLamports, setPriorityFeeLamports] = useState<number>(5000);
  // Once the user has typed a fee, the market lookup below must not replace it.
  const [priorityFeeEdited, setPriorityFeeEdited] = useState(false);
  const [computeUnitBudget, setComputeUnitBudget] = useState<number>(200_000);

  const isTransactionReady = proposalStatus === 'Approved';

  const { connection } = useMultisigData();
  const queryClient = useQueryClient();

  // Seed the fee field from the live market when the dialog opens, so the value
  // shown is what this transaction's accounts are actually going for rather than
  // a hardcoded guess. The user stays free to override it — and a value they
  // typed while the lookup was still in flight wins over the lookup.
  useEffect(() => {
    if (!isOpen || priorityFeeEdited) return;
    let cancelled = false;

    const [transactionPda] = multisig.getTransactionPda({
      multisigPda: new PublicKey(multisigPda),
      index: BigInt(transactionIndex),
      programId: programId ? new PublicKey(programId) : multisig.PROGRAM_ID,
    });
    getPriorityFeeMicroLamports(connection, [transactionPda, new PublicKey(multisigPda)]).then(
      (fee) => {
        if (!cancelled) setPriorityFeeLamports(fee);
      }
    );

    // Also fires when `priorityFeeEdited` flips, which is what discards a
    // lookup that was still in flight when the user started typing.
    return () => {
      cancelled = true;
    };
  }, [isOpen, priorityFeeEdited, connection, multisigPda, transactionIndex, programId]);

  const executeTransaction = async () => {
    console.log('[ExecuteButton] Starting execution process', {
      multisigPda,
      transactionIndex,
      proposalStatus,
      wallet: wallet.publicKey?.toBase58(),
      priorityFeeLamports,
      computeUnitBudget,
    });

    // Clear any previous errors
    setErrorMessage(null);

    // Both fields are free text. web3.js feeds the fee through BigInt(), which
    // throws on fractions and NaN, and a NaN limit would be sent as garbage.
    if (!Number.isInteger(priorityFeeLamports) || priorityFeeLamports < 0) {
      throw new Error('Priority fee must be a whole number of micro-lamports per compute unit.');
    }
    if (!Number.isInteger(computeUnitBudget) || computeUnitBudget < 0) {
      throw new Error('Compute unit budget must be a whole number.');
    }

    if (!wallet.publicKey) {
      walletModal.setVisible(true);
      throw new Error('Wallet not connected');
    }
    const member = wallet.publicKey;
    let bigIntTransactionIndex = BigInt(transactionIndex);

    if (!isTransactionReady) {
      toast.error('Proposal has not reached threshold.');
      return;
    }

    const [transactionPda] = multisig.getTransactionPda({
      multisigPda: new PublicKey(multisigPda),
      index: bigIntTransactionIndex,
      programId: programId ? new PublicKey(programId) : multisig.PROGRAM_ID,
    });

    let txData;
    let txType;
    try {
      await multisig.accounts.VaultTransaction.fromAccountAddress(
        // @ts-ignore
        connection,
        transactionPda
      );
      txType = 'vault';
    } catch (error) {
      try {
        await multisig.accounts.ConfigTransaction.fromAccountAddress(
          // @ts-ignore
          connection,
          transactionPda
        );
        txType = 'config';
      } catch (e) {
        txData = await multisig.accounts.Batch.fromAccountAddress(
          // @ts-ignore
          connection,
          transactionPda
        );
        txType = 'batch';
      }
    }

    // Only the execute instructions. The pipeline attaches the compute budget
    // once simulation has measured what the work actually costs.
    const executes: Execute[] = [];

    console.log('[ExecuteButton] Building transaction data');

    if (txType == 'vault') {
      const resp = await multisig.instructions.vaultTransactionExecute({
        multisigPda: new PublicKey(multisigPda),
        // @ts-ignore
        connection,
        member,
        transactionIndex: bigIntTransactionIndex,
        programId: programId ? new PublicKey(programId) : multisig.PROGRAM_ID,
      });
      executes.push({
        instructions: [resp.instruction],
        lookupTableAccounts: resp.lookupTableAccounts,
      });
    } else if (txType == 'config') {
      const executeIx = multisig.instructions.configTransactionExecute({
        multisigPda: new PublicKey(multisigPda),
        member,
        rentPayer: member,
        transactionIndex: bigIntTransactionIndex,
        programId: programId ? new PublicKey(programId) : multisig.PROGRAM_ID,
      });

      executes.push({ instructions: [executeIx] });
    } else if (txType == 'batch' && txData) {
      const executedBatchIndex = txData.executedTransactionIndex;
      const batchSize = txData.size;

      if (executedBatchIndex === undefined || batchSize === undefined) {
        throw new Error(
          "executedBatchIndex or batchSize is undefined and can't execute the transaction"
        );
      }

      const batchExecutes = await Promise.all(
        range(executedBatchIndex + 1, batchSize).map(async (batchIndex) => {
          const { instruction: transactionExecuteIx, lookupTableAccounts } =
            await multisig.instructions.batchExecuteTransaction({
              // @ts-ignore
              connection,
              member,
              batchIndex: bigIntTransactionIndex,
              transactionIndex: batchIndex,
              multisigPda: new PublicKey(multisigPda),
              programId: programId ? new PublicKey(programId) : multisig.PROGRAM_ID,
            });

          return { instructions: [transactionExecuteIx], lookupTableAccounts };
        })
      );

      executes.push(...batchExecutes);
    }

    console.log('[ExecuteButton] Built', executes.length, 'transaction(s) data');

    // Each execute runs the full pipeline on its own: simulate to size compute
    // (the dialog's value is a floor the user can raise), fresh blockhash, sign,
    // rebroadcast until confirmed. Strictly in order — a batch's executes are
    // order-dependent on chain, each one's PDA seeded by the index the previous
    // one advanced, so transaction i+1 cannot even simulate until i has landed.
    // That is also why a batch costs one wallet prompt per execute rather than a
    // single signAllTransactions: signing them all up front on one blockhash
    // meant sizing i+1 blind and racing the window with every confirm.
    const signatures: string[] = [];

    for (let i = 0; i < executes.length; i++) {
      const position = executes.length > 1 ? ` ${i + 1} of ${executes.length}` : '';
      try {
        signatures.push(
          await signSendAndConfirmV0(connection, wallet, executes[i].instructions, {
            lookupTables: executes[i].lookupTableAccounts,
            label: executes.length > 1 ? `ExecuteButton tx ${i + 1}` : 'ExecuteButton',
            priorityFeeMicroLamports: priorityFeeLamports,
            minComputeUnits: computeUnitBudget,
            onStep: toastSteps({
              preparing: `Simulating transaction${position}...`,
              signing: `Approve transaction${position} in your wallet...`,
              confirming: `Confirming transaction${position}...`,
            }),
          })
        );
      } catch (error) {
        console.error(`[ExecuteButton] Transaction ${i + 1} error:`, error);
        // In a batch, say which one broke and that the earlier ones stand.
        const prefix =
          executes.length > 1
            ? `Transaction ${i + 1} of ${executes.length} failed (${i} already executed): `
            : '';
        throw new Error(`${prefix}${describeSendError(error)}`);
      }
    }

    if (signatures.length === 0) {
      throw new Error('No transactions were sent successfully');
    }

    // All transactions succeeded
    console.log('[ExecuteButton] All transactions confirmed successfully');
    closeDialog();

    // Invalidate all relevant queries to refresh data
    console.log('[ExecuteButton] Invalidating queries');
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['transactions'] }),
      queryClient.invalidateQueries({ queryKey: ['multisig'] }),
      queryClient.invalidateQueries({ queryKey: ['proposal'] }),
      queryClient.invalidateQueries({ queryKey: ['transaction-details'] }),
    ]);

    // Return success result
    console.log('[ExecuteButton] Execution completed successfully');
    return {
      success: true,
      signatures,
      message:
        signatures.length === 1
          ? 'Transaction executed successfully!'
          : `All ${signatures.length} transactions executed successfully!`,
    };
  };
  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger
        disabled={!isTransactionReady}
        className={`h-8 px-3 text-sm ${!isTransactionReady ? `bg-primary/50` : `bg-primary hover:bg-primary/90`} rounded-md text-primary-foreground`}
        onClick={() => setIsOpen(true)}
      >
        Execute
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Execute Transaction</DialogTitle>
          <DialogDescription>
            Select custom priority fees and compute unit limits and execute transaction.
          </DialogDescription>
        </DialogHeader>
        {/* Error Display */}
        {errorMessage && (
          <div className="mb-4 rounded-lg border border-destructive/20 bg-destructive/10 p-3">
            <div className="flex items-start gap-2">
              <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-destructive" />
              <div className="text-sm text-destructive">
                <div className="mb-1 font-semibold">Transaction Failed</div>
                <div className="break-words">{errorMessage}</div>
              </div>
            </div>
          </div>
        )}

        <h3>Priority Fee (micro-lamports per compute unit)</h3>
        <Input
          type="number"
          min={0}
          step={1}
          placeholder="Priority Fee"
          onChange={(e) => {
            setPriorityFeeEdited(true);
            setPriorityFeeLamports(Number(e.target.value));
          }}
          value={priorityFeeLamports}
        />

        <h3>Minimum Compute Unit Budget</h3>
        <Input
          type="number"
          min={0}
          step={1}
          placeholder="Compute Unit Budget"
          onChange={(e) => setComputeUnitBudget(Number(e.target.value))}
          value={computeUnitBudget}
        />
        <Button
          disabled={!isTransactionReady}
          onClick={async () => {
            try {
              toast.promise(executeTransaction, {
                id: 'transaction',
                loading: 'Preparing transaction...',
                success: (result) => {
                  // Handle the success result properly
                  if (result?.message) {
                    return result.message;
                  }
                  return 'Transaction executed successfully!';
                },
                error: (error) => {
                  // Extract the error message
                  const errorMessage = error?.message || error?.toString() || 'Transaction failed';

                  // Set error in dialog for persistent display
                  setErrorMessage(errorMessage);

                  // Log full error for debugging
                  console.error('Full error details:', error);

                  // Return a formatted error message for the toast
                  if (errorMessage.length > 200) {
                    // Truncate very long errors but keep the important parts
                    return errorMessage.substring(0, 200) + '...';
                  }
                  return errorMessage;
                },
              });
            } catch (error) {
              // Catch any errors that might escape the promise
              console.error('Uncaught error:', error);
            }
          }}
          className="mr-2"
        >
          Execute
        </Button>
      </DialogContent>
    </Dialog>
  );
};

export default ExecuteButton;
