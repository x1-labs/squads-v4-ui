import { PublicKey } from '@solana/web3.js';
import { Button } from './ui/button';
import { useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { useAccess } from '../hooks/useAccess';
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
  const isMember = useAccess();
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
    });
    await signSendAndConfirmV0(connection, wallet, instructions, {
      label: 'RemoveSpendingLimitButton',
      onStep: toastSteps(),
    });
    await queryClient.invalidateQueries({ queryKey: ['transactions'] });
  };

  return (
    <Button
      size="sm"
      variant="outline"
      disabled={!isMember}
      onClick={() =>
        toast.promise(removeSpendingLimit, {
          id: 'transaction',
          loading: 'Loading...',
          success: 'Spending limit removal proposed.',
          error: (e) => `Failed to propose: ${formatError(e)}`,
        })
      }
    >
      Remove
    </Button>
  );
};

export default RemoveSpendingLimitButton;
