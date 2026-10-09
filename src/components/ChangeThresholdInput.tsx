import { Button } from './ui/button';
import { Input } from './ui/input';
import { useWallet } from '@solana/wallet-adapter-react';
import { useState } from 'react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import * as multisig from '@sqds/multisig';
import { PublicKey } from '@solana/web3.js';
import { toast } from 'sonner';
import { useMultisig } from '../hooks/useServices';
import invariant from 'invariant';
import { types as multisigTypes } from '@sqds/multisig';
import { signSendAndConfirmV0 } from '../lib/transaction/signSendAndConfirm';
import { toastSteps } from '../lib/transaction/toastSteps';
import { proposedMessage, withProposal } from '../lib/transaction/proposalInstructions';
import { useQueryClient } from '@tanstack/react-query';
import { useMultisigData } from '../hooks/useMultisigData';
import { useProposePermissions } from '../hooks/useProposePermissions';
import { DisabledReason } from './DisabledReason';

type ChangeThresholdInputProps = {
  multisigPda: string;
  transactionIndex: number;
};

const ChangeThresholdInput = ({ multisigPda, transactionIndex }: ChangeThresholdInputProps) => {
  const { data: multisigConfig } = useMultisig();
  const [threshold, setThreshold] = useState('');
  const wallet = useWallet();
  const walletModal = useWalletModal();
  const queryClient = useQueryClient();
  const { canInitiate, canVote, initiateReason } = useProposePermissions();

  const bigIntTransactionIndex = BigInt(transactionIndex);
  const { connection, programId } = useMultisigData();

  const countVoters = (members: multisig.types.Member[]) => {
    return members.filter(
      (member) =>
        (member.permissions.mask & multisigTypes.Permission.Vote) === multisigTypes.Permission.Vote
    ).length;
  };

  const validateThreshold = () => {
    invariant(multisigConfig, 'Invalid multisig conf loaded');
    const totalVoters = countVoters(multisigConfig.members);

    if (parseInt(threshold, 10) < 1) {
      return 'Threshold must be at least 1.';
    }
    if (parseInt(threshold) > totalVoters) {
      return `Threshold cannot exceed ${totalVoters} (total voters).`;
    }
    return null; // Valid input
  };

  const changeThreshold = async () => {
    if (!wallet.publicKey) {
      walletModal.setVisible(true);
      return;
    }
    const validateError = validateThreshold();
    if (validateError) {
      throw validateError;
    }

    const changeThresholdIx = multisig.instructions.configTransactionCreate({
      multisigPda: new PublicKey(multisigPda),
      actions: [
        {
          __kind: 'ChangeThreshold',
          newThreshold: parseInt(threshold),
        },
      ],
      creator: wallet.publicKey,
      transactionIndex: bigIntTransactionIndex,
      rentPayer: wallet.publicKey,
      programId: programId ? new PublicKey(programId) : multisig.PROGRAM_ID,
    });
    const proposalIxs = withProposal(changeThresholdIx, {
      multisigPda: new PublicKey(multisigPda),
      creator: wallet.publicKey,
      transactionIndex: bigIntTransactionIndex,
      programId: programId ? new PublicKey(programId) : multisig.PROGRAM_ID,
      approve: canVote,
    });

    // Priority fee, sized compute budget, fresh blockhash, sign, then rebroadcast
    // until confirmed or expired. Throws with a message that says whether it landed.
    await signSendAndConfirmV0(connection, wallet, proposalIxs, {
      label: 'ChangeThresholdInput',
      onStep: toastSteps(),
    });
    await queryClient.invalidateQueries({ queryKey: ['transactions'] });
    await queryClient.invalidateQueries({ queryKey: ['multisig'] });
  };
  return (
    <div>
      <Input
        placeholder={multisigConfig ? multisigConfig.threshold.toString() : ''}
        type="text"
        onChange={(e) => setThreshold(e.target.value.trim())}
        className="mb-3"
      />
      <DisabledReason reason={initiateReason}>
        <Button
          onClick={() =>
            toast.promise(changeThreshold, {
              id: 'transaction',
              loading: 'Loading...',
              success: proposedMessage('Threshold change proposed.', canVote),
              error: (e) => `Failed to propose: ${e}`,
            })
          }
          disabled={
            !canInitiate ||
            !threshold ||
            (!!multisigConfig && multisigConfig.threshold == parseInt(threshold, 10))
          }
        >
          Change Threshold
        </Button>
      </DisabledReason>
    </div>
  );
};

export default ChangeThresholdInput;
