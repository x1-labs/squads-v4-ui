import { PublicKey, Transaction } from '@solana/web3.js';
import { Button } from './ui/button';
import * as multisig from '@sqds/multisig';
import { useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { toast } from 'sonner';
import { useMultisigData } from '@/hooks/useMultisigData';
import { useQueryClient } from '@tanstack/react-query';
import { waitForConfirmation } from '../lib/transactionConfirmation';

type CancelButtonProps = {
  multisigPda: string;
  transactionIndex: number;
  proposalStatus: string;
  programId: string;
};

const CancelButton = ({
  multisigPda,
  transactionIndex,
  proposalStatus,
  programId,
}: CancelButtonProps) => {
  const wallet = useWallet();
  const walletModal = useWalletModal();
  const { connection } = useMultisigData();
  const queryClient = useQueryClient();

  // Only show for approved proposals (not executed yet)
  const canCancel = proposalStatus === 'Approved';

  const cancelProposal = async () => {
    console.log('[CancelButton] Starting cancellation process', {
      multisigPda,
      transactionIndex,
      proposalStatus,
      wallet: wallet.publicKey?.toBase58(),
    });

    if (!wallet.publicKey) {
      walletModal.setVisible(true);
      throw new Error('Wallet not connected');
    }

    const bigIntTransactionIndex = BigInt(transactionIndex);

    if (!canCancel) {
      toast.error("You can only cancel approved proposals that haven't been executed.");
      return;
    }

    let signature;
    try {
      console.log('[CancelButton] Building transaction');

      // Build transaction WITHOUT blockhash first for simulation
      const transaction = new Transaction();
      transaction.feePayer = wallet.publicKey;

      // Create the cancel instruction
      const cancelInstruction = multisig.instructions.proposalCancel({
        multisigPda: new PublicKey(multisigPda),
        member: wallet.publicKey,
        transactionIndex: bigIntTransactionIndex,
        programId: programId ? new PublicKey(programId) : multisig.PROGRAM_ID,
      });
      transaction.add(cancelInstruction);

      // Get blockhash for simulation only
      console.log('[CancelButton] Fetching blockhash for simulation');
      const { blockhash: simBlockhash } = await connection.getLatestBlockhash('confirmed');
      console.log('[CancelButton] Got simulation blockhash:', simBlockhash);
      transaction.recentBlockhash = simBlockhash;

      // First simulate to catch errors early
      console.log('[CancelButton] Simulating transaction');
      const simulation = await connection.simulateTransaction(transaction);
      console.log('[CancelButton] Simulation result:', simulation.value);

      if (simulation.value.err) {
        console.error('Simulation error:', simulation.value.err);

        // Parse error logs for meaningful messages
        const logs = simulation.value.logs || [];
        const errorLog = logs.find(
          (log) =>
            log.includes('Error') ||
            log.includes('failed') ||
            log.includes('NotAuthorized') ||
            log.includes('AnchorError')
        );

        if (errorLog) {
          // Extract error details from Anchor errors
          const anchorErrorMatch = errorLog.match(
            /Error Code: (\w+)\. Error Number: (\d+)\. Error Message: (.+?)(?:\.|$)/
          );
          if (anchorErrorMatch) {
            throw new Error(`${anchorErrorMatch[3]} (Code: ${anchorErrorMatch[1]})`);
          }

          // Check for authorization errors
          if (errorLog.includes('NotAuthorized') || errorLog.includes('Not authorized')) {
            throw new Error(
              'Not authorized to perform this action. You may not be a member of this multisig.'
            );
          }

          throw new Error(errorLog);
        }

        throw new Error(`Transaction simulation failed: ${JSON.stringify(simulation.value.err)}`);
      }

      // Get FRESH blockhash right before sending (after user sees the simulation success)
      // This minimizes the time between getting blockhash and wallet approval
      console.log('[CancelButton] Fetching FRESH blockhash for sending');
      const startFreshBlockhash = Date.now();
      const { blockhash: freshBlockhash } = await connection.getLatestBlockhash('finalized');
      console.log(
        '[CancelButton] Got fresh blockhash:',
        freshBlockhash,
        'in',
        Date.now() - startFreshBlockhash,
        'ms'
      );
      transaction.recentBlockhash = freshBlockhash;

      // If simulation passes, send the transaction with fresh blockhash
      console.log('[CancelButton] Sending transaction to wallet for approval');
      const startSend = Date.now();
      signature = await wallet.sendTransaction(transaction, connection, {
        skipPreflight: false,
        maxRetries: 3,
      });
      console.log(
        '[CancelButton] Transaction sent! Signature:',
        signature,
        'Time to sign:',
        Date.now() - startSend,
        'ms'
      );

      toast.loading('Confirming cancellation...', {
        id: 'transaction',
      });

      console.log('[CancelButton] Waiting for confirmation');
      const startConfirm = Date.now();
      const confirmations = await waitForConfirmation(connection, [signature]);
      console.log(
        '[CancelButton] Confirmation result:',
        confirmations,
        'Time to confirm:',
        Date.now() - startConfirm,
        'ms'
      );

      // Check if transaction failed
      const status = confirmations[0];
      if (!status || status.err !== null) {
        if (!status) {
          throw new Error(`Transaction not found or expired. Signature: ${signature}`);
        }
        if (status.err) {
          const errorStr = JSON.stringify(status.err);
          if (errorStr.includes('InstructionError')) {
            throw new Error(
              `Transaction failed with instruction error. Check explorer for signature: ${signature}`
            );
          }
          throw new Error(`Transaction failed: ${errorStr}`);
        }
        throw new Error(`Transaction failed. Check explorer for signature: ${signature}`);
      }

      // Invalidate all relevant queries to refresh data
      console.log('[CancelButton] Invalidating queries');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['transactions'] }),
        queryClient.invalidateQueries({ queryKey: ['multisig'] }),
        queryClient.invalidateQueries({ queryKey: ['proposal'] }),
        queryClient.invalidateQueries({ queryKey: ['transaction-details'] }),
      ]);

      // Force a page reload after a short delay to ensure all data is fresh
      console.log('[CancelButton] Scheduling page reload');
      setTimeout(() => {
        window.location.reload();
      }, 1500);

      // Return success with signature
      console.log('[CancelButton] Cancellation completed successfully');
      return { success: true, signature };
    } catch (error: any) {
      console.error('[CancelButton] Cancellation error:', error);
      console.error('[CancelButton] Error stack:', error?.stack);

      // Check for common errors
      if (error.message?.includes('blockhash not found')) {
        throw new Error('Transaction expired. Please try again.');
      }

      if (error.message?.includes('insufficient funds')) {
        throw new Error('Insufficient funds for transaction fees.');
      }

      if (error.message?.includes('User rejected')) {
        throw new Error('Transaction cancelled by user.');
      }

      // Re-throw with better context
      throw error;
    }
  };

  if (!canCancel) {
    return null;
  }

  return (
    <Button
      onClick={() =>
        toast.promise(cancelProposal, {
          id: 'transaction',
          loading: 'Preparing cancellation...',
          success: (result) => {
            // Handle the success result properly
            if (result?.signature) {
              console.log('Cancellation successful with signature:', result.signature);
              return 'Proposal cancelled successfully!';
            }
            return 'Proposal cancelled.';
          },
          error: (error) => {
            // Extract error message properly
            const errorMessage = error?.message || error?.toString() || 'Failed to cancel';

            // Log full error for debugging
            console.error('Full cancellation error:', error);

            // Return formatted error message
            if (errorMessage.length > 200) {
              return errorMessage.substring(0, 200) + '...';
            }
            return errorMessage;
          },
        })
      }
      className="h-8 px-3 text-sm"
      variant="outline"
    >
      Cancel
    </Button>
  );
};

export default CancelButton;
