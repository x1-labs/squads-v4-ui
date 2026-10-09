import { PublicKey } from '@solana/web3.js';
import { Button } from './ui/button';
import { useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { useMemberPermissions } from '../hooks/useAccess';
import { useMultisigData } from '../hooks/useMultisigData';
import { signSendAndConfirmV0 } from '../lib/transaction/signSendAndConfirm';
import { toastSteps } from '../lib/transaction/toastSteps';
import { configProposalInstructions } from '../lib/transaction/configProposal';
import { formatError } from '@/lib/utils/errorHandler';

type RemoveSpendingLimitButtonProps = {
  multisigPda: string;
  transactionIndex: number;
  spendingLimit: PublicKey;
};

const RemoveSpendingLimitButton = ({
  multisigPda,
  transactionIndex,
  spendingLimit,
}: RemoveSpendingLimitButtonProps) => {
  const wallet = useWallet();
  const walletModal = useWalletModal();
  const { canInitiate, canVote } = useMemberPermissions();
  const queryClient = useQueryClient();
  const { connection, programId } = useMultisigData();

  const removeSpendingLimit = async () => {
    if (!wallet.publicKey) {
      walletModal.setVisible(true);
      return;
    }
    const instructions = configProposalInstructions({
      multisigPda: new PublicKey(multisigPda),
      actions: [{ __kind: 'RemoveSpendingLimit', spendingLimit }],
      creator: wallet.publicKey,
      transactionIndex: BigInt(transactionIndex),
      programId,
      approve: canVote,
    });
    await signSendAndConfirmV0(connection, wallet, instructions, {
      label: 'RemoveSpendingLimitButton',
      onStep: toastSteps(),
    });
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['transactions'] }),
      queryClient.invalidateQueries({ queryKey: ['multisig'] }),
    ]);
  };

  return (
    <Button
      size="sm"
      variant="outline"
      disabled={!canInitiate}
      onClick={() =>
        toast.promise(removeSpendingLimit, {
          id: 'transaction',
          loading: 'Loading...',
          success: canVote
            ? 'Spending limit removal proposed.'
            : 'Spending limit removal proposed. It still needs approvals.',
          error: (e) => `Failed to propose: ${formatError(e)}`,
        })
      }
    >
      Remove
    </Button>
  );
};

export default RemoveSpendingLimitButton;
