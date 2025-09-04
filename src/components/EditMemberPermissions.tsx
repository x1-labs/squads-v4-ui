import { Button } from './ui/button';
import { useWallet } from '@solana/wallet-adapter-react';
import { useState } from 'react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import * as multisig from '@sqds/multisig';
import { PublicKey, TransactionMessage, VersionedTransaction } from '@solana/web3.js';
import { toast } from 'sonner';
import { useMultisig } from '@/hooks/useServices';
import { useAccess } from '@/hooks/useAccess';
import { useMultisigData } from '@/hooks/useMultisigData';
import { waitForConfirmation } from '../lib/transactionConfirmation';
import { useQueryClient } from '@tanstack/react-query';
import { Checkbox } from './ui/checkbox';
import { Label } from './ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from './ui/dialog';
import { Settings } from 'lucide-react';

type EditMemberPermissionsProps = {
  memberKey: string;
  currentPermissions: number;
  multisigPda: string;
  transactionIndex: number;
  programId: string;
};

// Permission bitmask values
const PERMISSIONS = {
  PROPOSER: 1, // Can propose transactions
  VOTER: 2, // Can vote on transactions
  EXECUTOR: 4, // Can execute transactions
  // Almighty = 7 (combination of all: 1 + 2 + 4)
};

const EditMemberPermissions = ({
  memberKey,
  currentPermissions,
  multisigPda,
  transactionIndex,
  programId,
}: EditMemberPermissionsProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [permissions, setPermissions] = useState(currentPermissions);
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

  const updatePermissions = async () => {
    if (!wallet.publicKey) {
      walletModal.setVisible(true);
      return;
    }

    // To change permissions, we need to remove and re-add the member with new permissions
    const changeMemberPermissionsIx = multisig.instructions.configTransactionCreate({
      multisigPda: new PublicKey(multisigPda),
      actions: [
        {
          __kind: 'RemoveMember',
          oldMember: new PublicKey(memberKey),
        },
        {
          __kind: 'AddMember',
          newMember: {
            key: new PublicKey(memberKey),
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
      instructions: [changeMemberPermissionsIx, proposalIx, approveIx],
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
    setIsOpen(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" disabled={!hasAccess}>
          <Settings className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Edit Member Permissions</DialogTitle>
          <DialogDescription>
            Configure permissions for member:
            <br />
            <span className="font-mono text-xs">
              {memberKey.slice(0, 8)}...{memberKey.slice(-8)}
            </span>
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-3">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="proposer"
                checked={isPermissionEnabled(PERMISSIONS.PROPOSER)}
                onCheckedChange={() => handlePermissionToggle(PERMISSIONS.PROPOSER)}
              />
              <Label htmlFor="proposer" className="text-sm font-normal">
                <span className="font-medium">Proposer</span> - Can create transaction proposals
              </Label>
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="voter"
                checked={isPermissionEnabled(PERMISSIONS.VOTER)}
                onCheckedChange={() => handlePermissionToggle(PERMISSIONS.VOTER)}
              />
              <Label htmlFor="voter" className="text-sm font-normal">
                <span className="font-medium">Voter</span> - Can vote on proposals (approve/reject)
              </Label>
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="executor"
                checked={isPermissionEnabled(PERMISSIONS.EXECUTOR)}
                onCheckedChange={() => handlePermissionToggle(PERMISSIONS.EXECUTOR)}
              />
              <Label htmlFor="executor" className="text-sm font-normal">
                <span className="font-medium">Executor</span> - Can execute approved transactions
              </Label>
            </div>
          </div>
          <div className="rounded-md bg-muted p-3">
            <p className="text-xs text-muted-foreground">
              <span className="font-medium">Current permission value:</span> {permissions}
              {permissions === 7 && ' (Almighty - all permissions)'}
            </p>
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setIsOpen(false)}>
            Cancel
          </Button>
          <Button
            onClick={() =>
              toast.promise(updatePermissions, {
                id: 'transaction',
                loading: 'Loading...',
                success: 'Permission update proposed.',
                error: (e) => `Failed to propose: ${e}`,
              })
            }
            disabled={permissions === currentPermissions}
          >
            Update Permissions
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default EditMemberPermissions;
