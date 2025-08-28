import { PublicKey, Transaction } from '@solana/web3.js';
import { Button } from './ui/button';
import * as multisig from '@sqds/multisig';
import { useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { toast } from 'sonner';
import { useMultisigData } from '@/hooks/useMultisigData';
import { useQueryClient } from '@tanstack/react-query';
import { waitForConfirmation } from '../lib/transactionConfirmation';

type ApproveButtonProps = {
  multisigPda: string;
  transactionIndex: number;
  proposalStatus: string;
  programId: string;
};

const ApproveButton = ({
  multisigPda,
  transactionIndex,
  proposalStatus,
  programId,
}: ApproveButtonProps) => {
  const wallet = useWallet();
  const walletModal = useWalletModal();
  const validKinds = ['Rejected', 'Approved', 'Executing', 'Executed', 'Cancelled'];
  const isKindValid = validKinds.includes(proposalStatus || 'None');
  const { connection } = useMultisigData();
  const queryClient = useQueryClient();

  const approveProposal = async () => {
    if (!wallet.publicKey) {
      walletModal.setVisible(true);
      throw new Error('Wallet not connected');
    }
    let bigIntTransactionIndex = BigInt(transactionIndex);
    const actualProgramId = programId ? new PublicKey(programId) : multisig.PROGRAM_ID;
    // Get fresh blockhash
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');

    const transaction = new Transaction();
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = wallet.publicKey;
    if (proposalStatus === 'None') {
      const createProposalInstruction = multisig.instructions.proposalCreate({
        multisigPda: new PublicKey(multisigPda),
        creator: wallet.publicKey,
        isDraft: false,
        transactionIndex: bigIntTransactionIndex,
        rentPayer: wallet.publicKey,
        programId: actualProgramId,
      });
      transaction.add(createProposalInstruction);
    }
    if (proposalStatus == 'Draft') {
      const activateProposalInstruction = multisig.instructions.proposalActivate({
        multisigPda: new PublicKey(multisigPda),
        member: wallet.publicKey,
        transactionIndex: bigIntTransactionIndex,
        programId: actualProgramId,
      });
      transaction.add(activateProposalInstruction);
    }
    const approveProposalInstruction = multisig.instructions.proposalApprove({
      multisigPda: new PublicKey(multisigPda),
      member: wallet.publicKey,
      transactionIndex: bigIntTransactionIndex,
      programId: programId ? new PublicKey(programId) : multisig.PROGRAM_ID,
    });
    transaction.add(approveProposalInstruction);

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
      toast.loading('Confirming approval...', {
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
      console.error('Approval error:', error);

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
  return (
    <Button
      disabled={isKindValid}
      onClick={() =>
        toast.promise(approveProposal, {
          id: 'transaction',
          loading: 'Preparing approval...',
          success: (result) => {
            // Handle the success result properly
            if (result?.signature) {
              console.log('Approval successful with signature:', result.signature);
              return 'Proposal approved successfully!';
            }
            return 'Proposal approved.';
          },
          error: (error) => {
            // Extract error message properly
            const errorMessage = error?.message || error?.toString() || 'Failed to approve';

            // Log full error for debugging
            console.error('Full approval error:', error);

            // Return formatted error message
            if (errorMessage.length > 200) {
              return errorMessage.substring(0, 200) + '...';
            }
            return errorMessage;
          },
        })
      }
      className="h-8 px-3 text-sm"
      variant="default"
    >
      Approve
    </Button>
  );
};

export default ApproveButton;
