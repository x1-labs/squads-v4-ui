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
    console.log('[ApproveButton] Starting approval process', {
      multisigPda,
      transactionIndex,
      proposalStatus,
      wallet: wallet.publicKey?.toBase58(),
    });

    if (!wallet.publicKey) {
      walletModal.setVisible(true);
      throw new Error('Wallet not connected');
    }
    let bigIntTransactionIndex = BigInt(transactionIndex);
    const actualProgramId = programId ? new PublicKey(programId) : multisig.PROGRAM_ID;

    let signature;
    try {
      console.log('[ApproveButton] Building transaction');

      const instructions: TransactionInstruction[] = [];

      if (proposalStatus === 'None') {
        const createProposalInstruction = multisig.instructions.proposalCreate({
          multisigPda: new PublicKey(multisigPda),
          creator: wallet.publicKey,
          isDraft: false,
          transactionIndex: bigIntTransactionIndex,
          rentPayer: wallet.publicKey,
          programId: actualProgramId,
        });
        instructions.push(createProposalInstruction);
      }
      if (proposalStatus == 'Draft') {
        const activateProposalInstruction = multisig.instructions.proposalActivate({
          multisigPda: new PublicKey(multisigPda),
          member: wallet.publicKey,
          transactionIndex: bigIntTransactionIndex,
          programId: actualProgramId,
        });
        instructions.push(activateProposalInstruction);
      }
      const approveProposalInstruction = multisig.instructions.proposalApprove({
        multisigPda: new PublicKey(multisigPda),
        member: wallet.publicKey,
        transactionIndex: bigIntTransactionIndex,
        programId: actualProgramId,
      });
      instructions.push(approveProposalInstruction);

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
        label: 'ApproveButton',
        onStep: toastSteps({
          signing: 'Approve in your wallet...',
          confirming: 'Confirming approval...',
        }),
      });

      // Invalidate all relevant queries to refresh data
      console.log('[ApproveButton] Invalidating queries');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['transactions'] }),
        queryClient.invalidateQueries({ queryKey: ['multisig'] }),
        queryClient.invalidateQueries({ queryKey: ['proposal'] }),
        queryClient.invalidateQueries({ queryKey: ['transaction-details'] }),
      ]);

      // Return success with signature
      console.log('[ApproveButton] Approval completed successfully');
      return { success: true, signature };
    } catch (error: any) {
      console.error('[ApproveButton] Approval error:', error);
      console.error('[ApproveButton] Error stack:', error?.stack);

      throw new Error(describeSendError(error));
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
