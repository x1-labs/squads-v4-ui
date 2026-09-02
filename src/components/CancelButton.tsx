import { PublicKey } from '@solana/web3.js';
import type { TransactionInstruction } from '@solana/web3.js';
import { Button } from './ui/button';
import * as multisig from '@sqds/multisig';
import { useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { toast } from 'sonner';
import { useMultisigData } from '@/hooks/useMultisigData';
import { useQueryClient } from '@tanstack/react-query';
import { describeSendError, signSendAndConfirm } from '../lib/transaction/signSendAndConfirm';
import { toastSteps } from '../lib/transaction/toastSteps';

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
    const actualProgramId = programId ? new PublicKey(programId) : multisig.PROGRAM_ID;

    if (!canCancel) {
      toast.error("You can only cancel approved proposals that haven't been executed.");
      return;
    }

    let signature;
    try {
      console.log('[CancelButton] Building transaction');

      const instructions: TransactionInstruction[] = [];

      // Create the cancel instruction
      const cancelInstruction = multisig.instructions.proposalCancel({
        multisigPda: new PublicKey(multisigPda),
        member: wallet.publicKey,
        transactionIndex: bigIntTransactionIndex,
        programId: actualProgramId,
      });
      instructions.push(cancelInstruction);

      const [proposalPda] = multisig.getProposalPda({
        multisigPda: new PublicKey(multisigPda),
        transactionIndex: bigIntTransactionIndex,
        programId: actualProgramId,
      });

      // Simulates (failing before the wallet prompt with the program's error),
      // attaches a priced compute budget, signs, then rebroadcasts until the
      // signature confirms or the blockhash expires.
      signature = await signSendAndConfirm(connection, wallet, instructions, {
        writableAccounts: [proposalPda, new PublicKey(multisigPda)],
        label: 'CancelButton',
        onStep: toastSteps({
          signing: 'Cancel in your wallet...',
          confirming: 'Confirming cancellation...',
        }),
      });

      // Invalidate all relevant queries to refresh data
      console.log('[CancelButton] Invalidating queries');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['transactions'] }),
        queryClient.invalidateQueries({ queryKey: ['multisig'] }),
        queryClient.invalidateQueries({ queryKey: ['proposal'] }),
        queryClient.invalidateQueries({ queryKey: ['transaction-details'] }),
      ]);

      // Return success with signature
      console.log('[CancelButton] Cancellation completed successfully');
      return { success: true, signature };
    } catch (error: any) {
      console.error('[CancelButton] Cancellation error:', error);
      console.error('[CancelButton] Error stack:', error?.stack);

      throw new Error(describeSendError(error));
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
