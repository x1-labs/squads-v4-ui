import { Connection, PublicKey } from '@solana/web3.js';
import { Button } from './ui/button';
import * as multisig from '@sqds/multisig';
import { useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { toast } from 'sonner';
import { useProposePermissions } from '../hooks/useProposePermissions';
import { signSendAndConfirmV0 } from '../lib/transaction/signSendAndConfirm';
import { toastSteps } from '../lib/transaction/toastSteps';
import { proposedMessage, withProposal } from '../lib/transaction/proposalInstructions';
import { useQueryClient } from '@tanstack/react-query';
import { useMultisigData } from '../hooks/useMultisigData';
import { DisabledReason } from './DisabledReason';

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
  const { canInitiate, canVote, initiateReason } = useProposePermissions();
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
    const proposalIxs = withProposal(removeMemberIx, {
      multisigPda: new PublicKey(multisigPda),
      creator: wallet.publicKey,
      transactionIndex: bigIntTransactionIndex,
      programId: programId ? new PublicKey(programId) : multisig.PROGRAM_ID,
      approve: canVote,
    });

    // Priority fee, sized compute budget, fresh blockhash, sign, then rebroadcast
    // until confirmed or expired. Throws with a message that says whether it landed.
    await signSendAndConfirmV0(connection, wallet, proposalIxs, {
      label: 'RemoveMemberButton',
      onStep: toastSteps(),
    });
    await queryClient.invalidateQueries({ queryKey: ['transactions'] });
    await queryClient.invalidateQueries({ queryKey: ['multisig'] });
  };
  return (
    <DisabledReason reason={initiateReason}>
      <Button
        size="sm"
        disabled={!canInitiate}
        onClick={() =>
          toast.promise(removeMember, {
            id: 'transaction',
            loading: 'Submitting...',
            success: proposedMessage('Remove Member action proposed.', canVote),
            error: (e) => `Failed to propose: ${e}`,
          })
        }
      >
        Remove
      </Button>
    </DisabledReason>
  );
};

export default RemoveMemberButton;
