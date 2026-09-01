import {
  AddressLookupTableAccount,
  ComputeBudgetProgram,
  PublicKey,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from '@solana/web3.js';
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
import { getSendableBlockhash, sendAndConfirm } from '../lib/transaction/sendAndConfirm';
import { getPriorityFeeMicroLamports } from '../lib/transaction/priorityFee';

type WithALT = {
  instruction: TransactionInstruction;
  lookupTableAccounts: AddressLookupTableAccount[];
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
  };
  const wallet = useWallet();
  const walletModal = useWalletModal();
  const [priorityFeeLamports, setPriorityFeeLamports] = useState<number>(5000);
  const [computeUnitBudget, setComputeUnitBudget] = useState<number>(200_000);

  const isTransactionReady = proposalStatus === 'Approved';

  const { connection } = useMultisigData();
  const queryClient = useQueryClient();

  // Seed the fee field from the live market when the dialog opens, so the value
  // shown is what this transaction's accounts are actually going for rather than
  // a hardcoded guess. The user stays free to override it.
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;

    getPriorityFeeMicroLamports(connection, [new PublicKey(multisigPda)]).then((fee) => {
      if (!cancelled) setPriorityFeeLamports(fee);
    });

    return () => {
      cancelled = true;
    };
  }, [isOpen, connection, multisigPda]);

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

    if (!wallet.publicKey) {
      walletModal.setVisible(true);
      throw new Error('Wallet not connected');
    }
    const member = wallet.publicKey;
    if (!wallet.signAllTransactions) {
      throw new Error('Wallet does not support signing multiple transactions');
    }
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

    // Store transaction building data so we can rebuild with fresh blockhash
    type TxBuildData = {
      instructions: TransactionInstruction[];
      lookupTableAccounts?: AddressLookupTableAccount[];
    };
    const txBuildDataList: TxBuildData[] = [];

    // `txBuildDataList` holds only the execute instructions. Compute budget is
    // attached later, once simulation has measured what the work actually costs.
    //
    // The budget instructions used to be gated on `!= 5000` / `!= 200_000`, which
    // dropped them precisely when the user left the defaults alone: the dialog
    // displayed a 5000 priority fee and the transaction carried none. They also
    // have to travel together — the fee is price × limit, so a price without a
    // limit bids against the implicit 200k-CU-per-instruction default.

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
      txBuildDataList.push({
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

      txBuildDataList.push({
        instructions: [executeIx],
        lookupTableAccounts: undefined,
      });
    } else if (txType == 'batch' && txData) {
      const executedBatchIndex = txData.executedTransactionIndex;
      const batchSize = txData.size;

      if (executedBatchIndex === undefined || batchSize === undefined) {
        throw new Error(
          "executedBatchIndex or batchSize is undefined and can't execute the transaction"
        );
      }

      const batchBuildData = await Promise.all(
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

          return {
            instructions: [transactionExecuteIx],
            lookupTableAccounts,
          };
        })
      );

      txBuildDataList.push(...batchBuildData);
    }

    console.log('[ExecuteButton] Built', txBuildDataList.length, 'transaction(s) data');

    // Get FRESH blockhash right before building and signing transactions
    // This is critical because user approval can take 30+ seconds
    console.log('[ExecuteButton] Fetching FRESH blockhash for transaction building');
    const startFreshBlockhash = Date.now();
    const { blockhash: freshBlockhash, lastValidBlockHeight } =
      await getSendableBlockhash(connection);
    console.log(
      '[ExecuteButton] Got fresh blockhash:',
      freshBlockhash,
      'valid through block',
      lastValidBlockHeight,
      'in',
      Date.now() - startFreshBlockhash,
      'ms'
    );

    const buildTransaction = (instructions: TransactionInstruction[], data: TxBuildData) =>
      new VersionedTransaction(
        new TransactionMessage({
          instructions,
          payerKey: member,
          recentBlockhash: freshBlockhash,
        }).compileToV0Message(data.lookupTableAccounts)
      );

    // Measure each execute before attaching a compute budget to it.
    //
    // The limit cannot simply be the dialog's value: an execute whose inner
    // instructions cost more than the field says would be capped below what it
    // needs and fail with ComputeBudgetExceeded. Simulating first sizes the limit
    // to the real cost, and the field acts as a floor the user can raise.
    console.log('[ExecuteButton] Measuring compute usage');
    const measuredUnits = await Promise.all(
      txBuildDataList.map(async (buildData) => {
        try {
          const probe = await connection.simulateTransaction(
            buildTransaction(buildData.instructions, buildData),
            { sigVerify: false, replaceRecentBlockhash: true }
          );
          // A failing probe is not fatal here — the post-signing simulation below
          // produces a far better error message, so fall back and let it speak.
          return probe.value.err ? null : (probe.value.unitsConsumed ?? null);
        } catch (error) {
          console.warn('[ExecuteButton] Compute measurement failed, using the field value:', error);
          return null;
        }
      })
    );

    // Build transactions with fresh blockhash
    console.log('[ExecuteButton] Building transactions with fresh blockhash');
    const transactions = txBuildDataList.map((buildData, i) => {
      const measured = measuredUnits[i];
      // +600 covers the two ComputeBudget instructions themselves (150 CU each,
      // and they are not present in the probe that produced `measured`).
      const units = Math.max(
        computeUnitBudget,
        measured ? Math.ceil(measured * 1.2) + 600 : computeUnitBudget
      );
      console.log(`[ExecuteButton] tx ${i + 1} compute limit:`, units, '(measured', measured, ')');

      return buildTransaction(
        [
          ComputeBudgetProgram.setComputeUnitLimit({ units }),
          ComputeBudgetProgram.setComputeUnitPrice({ microLamports: priorityFeeLamports }),
          ...buildData.instructions,
        ],
        buildData
      );
    });

    console.log(
      '[ExecuteButton] Requesting wallet signatures for',
      transactions.length,
      'transaction(s)'
    );
    const startSign = Date.now();
    const signedTransactions = await wallet.signAllTransactions(transactions);
    console.log('[ExecuteButton] Got signatures in', Date.now() - startSign, 'ms');

    const confirmations: Promise<string>[] = [];

    for (let i = 0; i < signedTransactions.length; i++) {
      const signedTx = signedTransactions[i];
      console.log(
        `[ExecuteButton] Processing transaction ${i + 1} of ${signedTransactions.length}`
      );
      try {
        // First simulate the transaction to catch errors early
        console.log(`[ExecuteButton] Simulating transaction ${i + 1}`);
        const simulation = await connection.simulateTransaction(signedTx, {
          commitment: 'processed',
        });
        console.log(`[ExecuteButton] Simulation result for tx ${i + 1}:`, simulation.value);

        if (simulation.value.err) {
          console.error('Simulation error:', simulation.value.err);
          console.error('Full simulation logs:', simulation.value.logs);

          // Parse the error logs for meaningful messages
          const logs = simulation.value.logs || [];

          // Check for signature verification failure
          if (JSON.stringify(simulation.value.err).includes('SignatureVerificationFailed')) {
            console.error('Signature verification failed. Transaction details:', {
              transaction: signedTx,
              signers: signedTx.signatures,
              message: signedTx.message,
            });
            throw new Error(
              'Transaction signature verification failed. This usually means a required signer is missing or the transaction needs to be reconstructed.'
            );
          }

          const errorLog = logs.find(
            (log) =>
              log.includes('Error') ||
              log.includes('failed') ||
              log.includes('NotAuthorized') ||
              log.includes('AnchorError')
          );

          if (errorLog) {
            // Check for stake pool specific error
            if (
              errorLog.includes(
                'First update old validator stake account balances and then pool stake balance'
              )
            ) {
              throw new Error(
                'Stake pool needs to be updated. Please wait a moment and try again.'
              );
            }

            // Extract error details from Anchor errors
            const anchorErrorMatch = errorLog.match(
              /Error Code: (\w+)\. Error Number: (\d+)\. Error Message: (.+?)(?:\.|$)/
            );
            if (anchorErrorMatch) {
              throw new Error(`${anchorErrorMatch[3]} (Code: ${anchorErrorMatch[1]})`);
            }

            // Extract other error patterns
            const notAuthorizedMatch = errorLog.match(
              /NotAuthorized|Not authorized to perform this action/
            );
            if (notAuthorizedMatch) {
              throw new Error(
                'Not authorized to perform this action. You may not be a member of this multisig or lack the required permissions.'
              );
            }

            throw new Error(errorLog);
          }

          throw new Error(`Transaction simulation failed: ${JSON.stringify(simulation.value.err)}`);
        }

        // If simulation passes, broadcast. Every transaction here shares the one
        // blockhash fetched above, so they are started together and awaited
        // together — confirming them one at a time would let the later ones
        // expire while the earlier ones are still settling.
        console.log(`[ExecuteButton] Sending transaction ${i + 1} to network`);
        confirmations.push(
          sendAndConfirm(connection, signedTx, lastValidBlockHeight, {
            label: `ExecuteButton tx ${i + 1}`,
          })
        );

        if (signedTransactions.length === 1) {
          toast.loading('Confirming transaction...', {
            id: 'transaction',
          });
        } else {
          toast.loading(`Confirming transaction ${i + 1} of ${signedTransactions.length}...`, {
            id: 'transaction',
          });
        }
      } catch (error: any) {
        console.error(`[ExecuteButton] Transaction ${i + 1} error:`, error);
        console.error(`[ExecuteButton] Error stack:`, error?.stack);

        // Check for common RPC errors
        if (error.message?.includes('blockhash not found')) {
          throw new Error('Transaction expired. Please try again.');
        }

        if (error.message?.includes('insufficient funds')) {
          throw new Error('Insufficient funds for transaction fees.');
        }

        if (error.logs) {
          // Parse logs for error messages
          const errorLog = error.logs.find(
            (log: string) =>
              log.includes('Error') || log.includes('failed') || log.includes('NotAuthorized')
          );

          if (errorLog) {
            // Check for stake pool specific error
            if (
              errorLog.includes(
                'First update old validator stake account balances and then pool stake balance'
              )
            ) {
              throw new Error(
                'Stake pool needs to be updated. Please wait a moment and try again.'
              );
            }

            const anchorErrorMatch = errorLog.match(
              /Error Code: (\w+)\. Error Number: (\d+)\. Error Message: (.+?)(?:\.|$)/
            );
            if (anchorErrorMatch) {
              throw new Error(`${anchorErrorMatch[3]} (Code: ${anchorErrorMatch[1]})`);
            }
            throw new Error(errorLog);
          }
        }

        // Re-throw with more context
        throw error;
      }
    }

    if (confirmations.length === 0) {
      throw new Error('No transactions were sent successfully');
    }

    console.log(
      '[ExecuteButton] Waiting for confirmations for',
      confirmations.length,
      'transaction(s)'
    );
    const startConfirm = Date.now();

    // Each promise resolves with its signature or rejects with a message that
    // already says whether the transaction failed on chain or never landed at
    // all. `allSettled` rather than `all` so one failure in a batch doesn't hide
    // the outcome of the others.
    const results = await Promise.allSettled(confirmations);
    console.log('[ExecuteButton] Confirmation results in', Date.now() - startConfirm, 'ms');

    const failures = results.flatMap((result, idx) =>
      result.status === 'rejected' ? [`Transaction ${idx + 1}: ${result.reason?.message}`] : []
    );

    if (failures.length > 0) {
      throw new Error(failures.join('; '));
    }

    const signatures = results.map((result) => (result as PromiseFulfilledResult<string>).value);

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

        <h3>Priority Fee in lamports</h3>
        <Input
          placeholder="Priority Fee"
          onChange={(e) => setPriorityFeeLamports(Number(e.target.value))}
          value={priorityFeeLamports}
        />

        <h3>Minimum Compute Unit Budget</h3>
        <Input
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
