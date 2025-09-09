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
import { useState } from 'react';
import { AlertCircle } from 'lucide-react';
import { Input } from './ui/input';
import { range } from '@/lib/utils';
import { useMultisigData } from '@/hooks/useMultisigData';
import { useQueryClient } from '@tanstack/react-query';
import { waitForConfirmation } from '../lib/transactionConfirmation';

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

  const executeTransaction = async () => {
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

    let transactions: VersionedTransaction[] = [];

    const priorityFeeInstruction = ComputeBudgetProgram.setComputeUnitPrice({
      microLamports: priorityFeeLamports,
    });
    const computeUnitInstruction = ComputeBudgetProgram.setComputeUnitLimit({
      units: computeUnitBudget,
    });

    let blockhash = (await connection.getLatestBlockhash()).blockhash;

    if (txType == 'vault') {
      const resp = await multisig.instructions.vaultTransactionExecute({
        multisigPda: new PublicKey(multisigPda),
        // @ts-ignore
        connection,
        member,
        transactionIndex: bigIntTransactionIndex,
        programId: programId ? new PublicKey(programId) : multisig.PROGRAM_ID,
      });

      transactions.push(
        new VersionedTransaction(
          new TransactionMessage({
            instructions: [priorityFeeInstruction, computeUnitInstruction, resp.instruction],
            payerKey: member,
            recentBlockhash: blockhash,
          }).compileToV0Message(resp.lookupTableAccounts)
        )
      );
    } else if (txType == 'config') {
      const executeIx = multisig.instructions.configTransactionExecute({
        multisigPda: new PublicKey(multisigPda),
        member,
        rentPayer: member,
        transactionIndex: bigIntTransactionIndex,
        programId: programId ? new PublicKey(programId) : multisig.PROGRAM_ID,
      });
      transactions.push(
        new VersionedTransaction(
          new TransactionMessage({
            instructions: [priorityFeeInstruction, computeUnitInstruction, executeIx],
            payerKey: member,
            recentBlockhash: blockhash,
          }).compileToV0Message()
        )
      );
    } else if (txType == 'batch' && txData) {
      const executedBatchIndex = txData.executedTransactionIndex;
      const batchSize = txData.size;

      if (executedBatchIndex === undefined || batchSize === undefined) {
        throw new Error(
          "executedBatchIndex or batchSize is undefined and can't execute the transaction"
        );
      }

      transactions.push(
        ...(await Promise.all(
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

            const message = new TransactionMessage({
              payerKey: member,
              recentBlockhash: blockhash,
              instructions: [priorityFeeInstruction, computeUnitInstruction, transactionExecuteIx],
            }).compileToV0Message(lookupTableAccounts);

            return new VersionedTransaction(message);
          })
        ))
      );
    }

    const signedTransactions = await wallet.signAllTransactions(transactions);

    let signatures = [];

    for (let i = 0; i < signedTransactions.length; i++) {
      const signedTx = signedTransactions[i];
      try {
        // First simulate the transaction to catch errors early
        const simulation = await connection.simulateTransaction(signedTx, {
          commitment: 'processed',
        });

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

        // If simulation passes, send the transaction
        const signature = await connection.sendRawTransaction(signedTx.serialize(), {
          skipPreflight: false,
          preflightCommitment: 'processed',
        });

        signatures.push(signature);
        console.log('Transaction signature', signature);

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
        console.error('Transaction error:', error);

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

    if (signatures.length === 0) {
      throw new Error('No transactions were sent successfully');
    }

    const confirmations = await waitForConfirmation(connection, signatures);
    console.log('Confirmation results:', confirmations);

    // Check if any transactions failed
    const failedTxs = confirmations.filter((status) => {
      // A transaction failed if it has an error or if status is null
      return !status || status.err !== null;
    });

    if (failedTxs.length > 0) {
      // Parse the error from failed transactions
      const errorMessages = failedTxs.map((status, idx) => {
        if (!status) {
          return `Transaction ${idx + 1} not found or expired`;
        }
        if (status.err) {
          // Try to parse the error
          if (typeof status.err === 'object' && status.err !== null) {
            const errorStr = JSON.stringify(status.err);
            // Check for common error types
            if (errorStr.includes('InstructionError')) {
              return `Transaction ${idx + 1} failed with instruction error`;
            }
            return `Transaction ${idx + 1} failed: ${errorStr}`;
          }
          return `Transaction ${idx + 1} failed with error`;
        }
        return `Transaction ${idx + 1} failed`;
      });

      throw new Error(errorMessages.join('; '));
    }

    // All transactions succeeded
    closeDialog();

    // Invalidate all relevant queries to refresh data
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['transactions'] }),
      queryClient.invalidateQueries({ queryKey: ['multisig'] }),
      queryClient.invalidateQueries({ queryKey: ['proposal'] }),
      queryClient.invalidateQueries({ queryKey: ['transaction-details'] }),
    ]);

    // Force a page reload after a short delay to ensure all data is fresh
    setTimeout(() => {
      window.location.reload();
    }, 1500);

    // Return success result
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

        <h3>Compute Unit Budget</h3>
        <Input
          placeholder="Priority Fee"
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
