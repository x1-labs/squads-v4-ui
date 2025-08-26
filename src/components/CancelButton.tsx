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
      throw 'Wallet not connected';
    }
    
    const bigIntTransactionIndex = BigInt(transactionIndex);
    
    if (!canCancel) {
      toast.error("You can only cancel approved proposals that haven't been executed.");
      return;
    }

    try {
      // Create the cancel instruction
      const cancelInstruction = multisig.instructions.proposalCancel({
        multisigPda: new PublicKey(multisigPda),
        member: wallet.publicKey,
        transactionIndex: bigIntTransactionIndex,
        programId: programId ? new PublicKey(programId) : multisig.PROGRAM_ID,
      });

      const transaction = new Transaction().add(cancelInstruction);

      const signature = await wallet.sendTransaction(transaction, connection, {
        skipPreflight: true,
      });
      
      console.log('Transaction signature', signature);
      toast.loading('Confirming...', {
        id: 'transaction',
      });
      
      const sent = await waitForConfirmation(connection, [signature]);
      if (!sent[0]) {
        throw `Transaction failed or unable to confirm. Check ${signature}`;
      }
      
      await queryClient.invalidateQueries({ queryKey: ['transactions'] });
    } catch (error) {
      console.error('Failed to cancel proposal:', error);
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
          loading: 'Loading...',
          success: 'Proposal cancelled.',
          error: (e) => `Failed to cancel: ${e}`,
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