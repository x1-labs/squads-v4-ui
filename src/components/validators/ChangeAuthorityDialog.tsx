import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Key, AlertTriangle } from 'lucide-react';
import { ValidatorInfo } from '@/lib/validators/validatorUtils';
import { createAuthorizeWithdrawerInstruction } from '@/lib/validators/validatorInstructions';
import { useMultisigData } from '@/hooks/useMultisigData';
import { useMultisig } from '@/hooks/useServices';
import { useWallet } from '@solana/wallet-adapter-react';
import { PublicKey, TransactionMessage } from '@solana/web3.js';
import * as multisig from '@sqds/multisig';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { signSendAndConfirmV0 } from '@/lib/transaction/signSendAndConfirm';
import { toastSteps } from '@/lib/transaction/toastSteps';

interface ChangeAuthorityDialogProps {
  validator: ValidatorInfo;
}

export function ChangeAuthorityDialog({ validator }: ChangeAuthorityDialogProps) {
  const [open, setOpen] = useState(false);
  const [newAuthority, setNewAuthority] = useState('');
  const [confirmAddress, setConfirmAddress] = useState('');
  const [loading, setLoading] = useState(false);
  
  const { connection, multisigVault, multisigAddress, vaultIndex, programId: multisigProgramId } = useMultisigData();
  const { data: squad } = useMultisig();
  const wallet = useWallet();
  const queryClient = useQueryClient();

  const handleSubmit = async () => {
    if (!squad || !multisigVault || !multisigAddress || !wallet.publicKey || !wallet.signTransaction) {
      toast.error('Please connect your wallet and select a Squad');
      return;
    }

    if (newAuthority !== confirmAddress) {
      toast.error('Addresses do not match');
      return;
    }

    let newAuthorityPubkey: PublicKey;
    try {
      newAuthorityPubkey = new PublicKey(newAuthority);
    } catch {
      toast.error('Invalid authority address');
      return;
    }

    setLoading(true);
    try {
      console.log('ChangeAuthorityDialog - Creating instruction:');
      console.log('  Vote account:', validator.votePubkey.toBase58());
      console.log('  Current authority (multisig vault):', multisigVault.toBase58());
      console.log('  New authority from input:', newAuthorityPubkey.toBase58());
      console.log('  Input string:', newAuthority);
      
      const instruction = createAuthorizeWithdrawerInstruction(
        validator.votePubkey,
        multisigVault,
        newAuthorityPubkey
      );

      const { blockhash } = await connection.getLatestBlockhash();
      
      const transactionMessage = new TransactionMessage({
        payerKey: multisigVault,
        recentBlockhash: blockhash,
        instructions: [instruction],
      });
      
      const vaultTransactionIndex = BigInt(Number(squad.transactionIndex) + 1);
      
      const multisigTransactionIx = multisig.instructions.vaultTransactionCreate({
        multisigPda: new PublicKey(multisigAddress),
        transactionIndex: vaultTransactionIndex,
        creator: wallet.publicKey,
        vaultIndex: vaultIndex,
        ephemeralSigners: 0,
        // @ts-ignore
        transactionMessage,
        addressLookupTableAccounts: [],
        rentPayer: wallet.publicKey,
        programId: multisigProgramId,
      });

      const proposalIx = multisig.instructions.proposalCreate({
        multisigPda: new PublicKey(multisigAddress),
        creator: wallet.publicKey,
        isDraft: false,
        transactionIndex: vaultTransactionIndex,
        rentPayer: wallet.publicKey,
        programId: multisigProgramId,
      });

      const approveIx = multisig.instructions.proposalApprove({
        multisigPda: new PublicKey(multisigAddress),
        member: wallet.publicKey,
        transactionIndex: vaultTransactionIndex,
        programId: multisigProgramId,
      });

      // Priority fee, sized compute budget, fresh blockhash, sign, then rebroadcast
      // until confirmed or expired. Throws with a message that says whether it landed.
      await signSendAndConfirmV0(connection, wallet, [multisigTransactionIx, proposalIx, approveIx], {
        label: 'ChangeAuthority',
        onStep: toastSteps(),
      });

      toast.success('Transaction created successfully', { id: 'transaction' });
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['squad'] });
      setOpen(false);
    } catch (error) {
      console.error('Error creating transaction:', error);
      // The pipeline's errors say whether anything landed; surface them as-is.
      toast.error(error instanceof Error ? error.message : 'Failed to create transaction', {
        id: 'transaction',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="w-full sm:w-auto">
          <Key className="h-4 w-4 sm:mr-2" />
          <span className="sm:inline">Change Authority</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Change Withdraw Authority</DialogTitle>
          <DialogDescription>
            Transfer the withdraw authority of this validator to a new address
          </DialogDescription>
        </DialogHeader>
        
        <div className="flex items-start gap-2 rounded-lg border border-destructive bg-destructive/10 p-4">
          <AlertTriangle className="h-4 w-4 mt-0.5 text-destructive" />
          <div className="text-sm">
            <strong>Warning:</strong> This action is irreversible. Once transferred, your Squad will no longer
            have control over this validator.
          </div>
        </div>

        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="newAuthority">New Authority Address</Label>
            <Input
              id="newAuthority"
              type="text"
              value={newAuthority}
              onChange={(e) => setNewAuthority(e.target.value)}
              placeholder="Enter new authority address"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="confirmAddress">Confirm Address</Label>
            <Input
              id="confirmAddress"
              type="text"
              value={confirmAddress}
              onChange={(e) => setConfirmAddress(e.target.value)}
              placeholder="Re-enter address to confirm"
            />
            <p className="text-xs text-muted-foreground">
              Please re-enter the address to confirm the transfer
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={loading}>
            Cancel
          </Button>
          <Button 
            variant="destructive" 
            onClick={handleSubmit} 
            disabled={loading || newAuthority !== confirmAddress}
          >
            {loading ? 'Creating...' : 'Transfer Authority'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}