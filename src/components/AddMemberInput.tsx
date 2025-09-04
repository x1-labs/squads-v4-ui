import { Button } from './ui/button';
import { Input } from './ui/input';
import { useWallet } from '@solana/wallet-adapter-react';
import { useState } from 'react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import * as multisig from '@sqds/multisig';
import { PublicKey, TransactionMessage, VersionedTransaction } from '@solana/web3.js';
import { toast } from 'sonner';
import { isPublickey } from '@/lib/isPublickey';
import { useMultisig } from '@/hooks/useServices';
import { useAccess } from '@/hooks/useAccess';
import { useMultisigData } from '@/hooks/useMultisigData';
import { isMember } from '../lib/utils';
import invariant from 'invariant';
import { waitForConfirmation } from '../lib/transactionConfirmation';
import { useQueryClient } from '@tanstack/react-query';
import { Checkbox } from './ui/checkbox';
import { Label } from './ui/label';

type AddMemberInputProps = {
  multisigPda: string;
  transactionIndex: number;
  programId: string;
};

// Permission bitmask values
const PERMISSIONS = {
  PROPOSER: 1, // Can propose transactions
  VOTER: 2, // Can vote on transactions
  EXECUTOR: 4, // Can execute transactions
};

const AddMemberInput = ({ multisigPda, transactionIndex, programId }: AddMemberInputProps) => {
  const [member, setMember] = useState('');
  const [permissions, setPermissions] = useState(7); // Default to all basic permissions
  const wallet = useWallet();
  const walletModal = useWalletModal();
  const { data: multisigConfig } = useMultisig();
  const bigIntTransactionIndex = BigInt(transactionIndex);
  const { connection } = useMultisigData();
  const queryClient = useQueryClient();
  const hasAccess = useAccess();

  const handlePermissionToggle = (permission: number) => {
    setPermissions((prev) => prev ^ permission); // XOR to toggle the bit
  };

  const isPermissionEnabled = (permission: number) => {
    return (permissions & permission) !== 0;
  };
  const addMember = async () => {
    invariant(multisigConfig, 'invalid multisig conf data');
    if (!wallet.publicKey) {
      walletModal.setVisible(true);
      return;
    }
    const newMemberKey = new PublicKey(member);
    const memberExists = isMember(newMemberKey, multisigConfig.members);
    if (memberExists) {
      throw 'Member already exists';
    }
    const addMemberIx = multisig.instructions.configTransactionCreate({
      multisigPda: new PublicKey(multisigPda),
      actions: [
        {
          __kind: 'AddMember',
          newMember: {
            key: newMemberKey,
            permissions: {
              mask: permissions,
            },
          },
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

    const message = new TransactionMessage({
      instructions: [addMemberIx, proposalIx, approveIx],
      payerKey: wallet.publicKey,
      recentBlockhash: (await connection.getLatestBlockhash()).blockhash,
    }).compileToV0Message();

    const transaction = new VersionedTransaction(message);

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
  };
  return (
    <div className="space-y-4">
      <Input placeholder="Member Public Key" onChange={(e) => setMember(e.target.value.trim())} />

      <div className="space-y-2">
        <Label className="text-sm font-medium">Member Permissions</Label>
        <div className="space-y-2 rounded-md border p-3">
          <div className="flex items-center space-x-2">
            <Checkbox
              id="add-proposer"
              checked={isPermissionEnabled(PERMISSIONS.PROPOSER)}
              onCheckedChange={() => handlePermissionToggle(PERMISSIONS.PROPOSER)}
            />
            <Label htmlFor="add-proposer" className="cursor-pointer text-sm font-normal">
              Proposer - Can create transaction proposals
            </Label>
          </div>
          <div className="flex items-center space-x-2">
            <Checkbox
              id="add-voter"
              checked={isPermissionEnabled(PERMISSIONS.VOTER)}
              onCheckedChange={() => handlePermissionToggle(PERMISSIONS.VOTER)}
            />
            <Label htmlFor="add-voter" className="cursor-pointer text-sm font-normal">
              Voter - Can vote on proposals (approve/reject)
            </Label>
          </div>
          <div className="flex items-center space-x-2">
            <Checkbox
              id="add-executor"
              checked={isPermissionEnabled(PERMISSIONS.EXECUTOR)}
              onCheckedChange={() => handlePermissionToggle(PERMISSIONS.EXECUTOR)}
            />
            <Label htmlFor="add-executor" className="cursor-pointer text-sm font-normal">
              Executor - Can execute approved transactions
            </Label>
          </div>
        </div>
      </div>

      <Button
        onClick={() =>
          toast.promise(addMember, {
            id: 'transaction',
            loading: 'Loading...',
            success: 'Add member action proposed.',
            error: (e) => `Failed to propose: ${e}`,
          })
        }
        disabled={!isPublickey(member) || !hasAccess || permissions === 0}
      >
        Add Member
      </Button>
    </div>
  );
};

export default AddMemberInput;
