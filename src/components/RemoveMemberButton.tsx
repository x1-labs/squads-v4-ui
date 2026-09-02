import { Connection, PublicKey } from '@solana/web3.js';
import { Button } from './ui/button';
import * as multisig from '@sqds/multisig';
import { useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { toast } from 'sonner';
import { useAccess } from '../hooks/useAccess';
import { signSendAndConfirmV0 } from '../lib/transaction/signSendAndConfirm';
import { useQueryClient } from '@tanstack/react-query';
import { useMultisigData } from '../hooks/useMultisigData';

type RemoveMemberButtonProps = {
  multisigPda: string;
  transactionIndex: number;
  memberKey: string;
  programId: string;
};

const RemoveMemberButton = ({
  multisigPda,
  transactionIndex,
  memberKey,
  programId,
}: RemoveMemberButtonProps) => {
  const wallet = useWallet();
  const walletModal = useWalletModal();
  const isMember = useAccess();
  const member = new PublicKey(memberKey);
  const queryClient = useQueryClient();
  const { connection } = useMultisigData();

  const removeMember = async () => {
    if (!wallet.publicKey) {
      walletModal.setVisible(true);
      return;
    }
    let bigIntTransactionIndex = BigInt(transactionIndex);

    const removeMemberIx = multisig.instructions.configTransactionCreate({
      multisigPda: new PublicKey(multisigPda),
      actions: [
        {
          __kind: 'RemoveMember',
          oldMember: member,
        },
      ],
      creator: wallet.publicKey,
      transactionIndex: bigIntTransactionIndex,
      rentPayer: wallet.publicKey,
      programId: programId ? new PublicKey(programId) : multisig.PROGRAM_ID,
    });
    const proposalIx = multisig.instructions.proposalCreate({
      multisigPda: new PublicKey(multisigPda),
      creator: wallet.publicKey,
      isDraft: false,
      transactionIndex: bigIntTransactionIndex,
      rentPayer: wallet.publicKey,
      programId: programId ? new PublicKey(programId) : multisig.PROGRAM_ID,
    });
    const approveIx = multisig.instructions.proposalApprove({
      multisigPda: new PublicKey(multisigPda),
      member: wallet.publicKey,
      transactionIndex: bigIntTransactionIndex,
      programId: programId ? new PublicKey(programId) : multisig.PROGRAM_ID,
    });

    // Priority fee, sized compute budget, fresh blockhash, sign, then rebroadcast
    // until confirmed or expired. Throws with a message that says whether it landed.
    await signSendAndConfirmV0(connection, wallet, [removeMemberIx, proposalIx, approveIx], {
      label: 'RemoveMemberButton',
      onStep: (step) => {
        if (step === 'confirming') toast.loading('Confirming...', { id: 'transaction' });
      },
    });
    await queryClient.invalidateQueries({ queryKey: ['transactions'] });
  };
  return (
    <Button
      size="sm"
      disabled={!isMember}
      onClick={() =>
        toast.promise(removeMember, {
          id: 'transaction',
          loading: 'Submitting...',
          success: 'Remove Member action proposed.',
          error: (e) => `Failed to propose: ${e}`,
        })
      }
    >
      Remove
    </Button>
  );
};

export default RemoveMemberButton;
