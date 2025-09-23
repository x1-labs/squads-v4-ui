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
import { Percent } from 'lucide-react';
import { ValidatorInfo } from '@/lib/validators/validatorUtils';
import { createUpdateCommissionInstruction } from '@/lib/validators/validatorInstructions';
import { useMultisigData } from '@/hooks/useMultisigData';
import { useMultisig } from '@/hooks/useServices';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { PublicKey, TransactionMessage, VersionedTransaction } from '@solana/web3.js';
import * as multisig from '@sqds/multisig';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';

interface ChangeCommissionDialogProps {
  validator: ValidatorInfo;
}

export function ChangeCommissionDialog({ validator }: ChangeCommissionDialogProps) {
  const [open, setOpen] = useState(false);
  const [commission, setCommission] = useState(validator.commission.toString());
  const [loading, setLoading] = useState(false);
  const [showWarning, setShowWarning] = useState(true);
  
  const { connection, multisigVault, multisigAddress, vaultIndex, programId: multisigProgramId } = useMultisigData();
  const { data: squad } = useMultisig();
  const wallet = useWallet();
  const queryClient = useQueryClient();

  const handleSubmit = async () => {
    if (!squad || !multisigVault || !multisigAddress || !wallet.publicKey || !wallet.signTransaction) {
      toast.error('Please connect your wallet and select a Squad');
      return;
    }

    const newCommission = parseFloat(commission);
    if (isNaN(newCommission) || newCommission < 0 || newCommission > 100) {
      toast.error('Commission must be between 0 and 100');
      return;
    }

    setLoading(true);
    try {
      console.log('ChangeCommissionDialog - Creating transaction:');
      console.log('  Validator vote account:', validator.votePubkey.toBase58());
      console.log('  Current withdrawer:', validator.withdrawAuthority.toBase58());
      console.log('  Multisig vault (should match withdrawer):', multisigVault.toBase58());
      console.log('  New commission:', Math.floor(newCommission));
      
      // Verify the vault is actually the withdrawer
      if (!validator.withdrawAuthority.equals(multisigVault)) {
        console.error('ERROR: Vault is not the withdraw authority!');
        console.error('  Expected:', validator.withdrawAuthority.toBase58());
        console.error('  Got:', multisigVault.toBase58());
        toast.error('This validator is not controlled by your Squad vault');
        setLoading(false);
        return;
      }
      
      // Additional validation
      console.log('Validator current commission:', validator.commission);
      console.log('Validator current balance:', validator.balance);
      
      const instruction = createUpdateCommissionInstruction(
        validator.votePubkey,
        multisigVault,
        Math.floor(newCommission)
      );
      
      console.log('Instruction created:', instruction);

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
        ephemeralSigners: 0, // Same as staking - multisig handles vault signing automatically
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

      const message = new TransactionMessage({
        payerKey: wallet.publicKey,
        recentBlockhash: blockhash,
        instructions: [multisigTransactionIx, proposalIx, approveIx],
      }).compileToV0Message();

      const tx = new VersionedTransaction(message);
      const signedTx = await wallet.signTransaction(tx);
      const sig = await connection.sendTransaction(signedTx);
      await connection.confirmTransaction(sig);

      toast.success('Transaction created successfully');
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['squad'] });
      setOpen(false);
    } catch (error: any) {
      console.error('Error creating transaction:', error);
      console.error('Full error details:', {
        message: error?.message,
        logs: error?.logs,
        code: error?.code,
        data: error?.data
      });
      
      const errorMessage = error?.message || 'Failed to create transaction';
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="w-full sm:w-auto">
          <Percent className="h-4 w-4 sm:mr-2" />
          <span className="sm:inline">Change Commission</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Change Validator Commission</DialogTitle>
          <DialogDescription>
            Update the commission rate for this validator. Current: {validator.commission}%
          </DialogDescription>
        </DialogHeader>
        {showWarning && (
          <div className="rounded-lg border border-yellow-500/50 bg-yellow-500/10 p-3">
            <p className="text-sm text-yellow-600 dark:text-yellow-400">
              <strong>Note:</strong> The UpdateCommission instruction may be disabled in the current Solana/X1 version. 
              If this transaction fails, you may need to use the Solana CLI or wait for a protocol update.
            </p>
          </div>
        )}
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="commission">New Commission (%)</Label>
            <Input
              id="commission"
              type="number"
              min="0"
              max="100"
              step="1"
              value={commission}
              onChange={(e) => setCommission(e.target.value)}
              placeholder="Enter commission percentage"
            />
            <p className="text-xs text-muted-foreground">
              Enter a value between 0 and 100
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={loading}>
            {loading ? 'Creating...' : 'Create Transaction'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}