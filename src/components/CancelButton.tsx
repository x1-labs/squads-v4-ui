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
    if (!wallet.publicKey) {
      walletModal.setVisible(true);
      throw new Error('Wallet not connected');
    }

    const bigIntTransactionIndex = BigInt(transactionIndex);

    if (!canCancel) {
      toast.error("You can only cancel approved proposals that haven't been executed.");
      return;
    }

    // Get fresh blockhash
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');

    // Create the cancel instruction
    const cancelInstruction = multisig.instructions.proposalCancel({
      multisigPda: new PublicKey(multisigPda),
      member: wallet.publicKey,
      transactionIndex: bigIntTransactionIndex,
      programId: programId ? new PublicKey(programId) : multisig.PROGRAM_ID,
    });

    const transaction = new Transaction();
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = wallet.publicKey;
    transaction.add(cancelInstruction);

    let signature;
    try {
      // First simulate to catch errors early
      const simulation = await connection.simulateTransaction(transaction);

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

      // If simulation passes, send the transaction
      signature = await wallet.sendTransaction(transaction, connection, {
        skipPreflight: false,
      });

      console.log('Transaction signature', signature);
      toast.loading('Confirming cancellation...', {
        id: 'transaction',
      });

      const confirmations = await waitForConfirmation(connection, [signature]);
      console.log('Confirmation result:', confirmations);

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

      // Return success with signature
      return { success: true, signature };
    } catch (error: any) {
      console.error('Cancellation error:', error);

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
