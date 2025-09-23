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
import { Wallet } from 'lucide-react';
import { ValidatorInfo } from '@/lib/validators/validatorUtils';
import { createWithdrawInstruction } from '@/lib/validators/validatorInstructions';
import { useMultisigData } from '@/hooks/useMultisigData';
import { useMultisig } from '@/hooks/useServices';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { PublicKey, LAMPORTS_PER_SOL, TransactionMessage, VersionedTransaction } from '@solana/web3.js';
import * as multisig from '@sqds/multisig';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';

interface WithdrawRewardsDialogProps {
  validator: ValidatorInfo;
}

export function WithdrawRewardsDialog({ validator }: WithdrawRewardsDialogProps) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(validator.rewards.toString());
  const [recipient, setRecipient] = useState('');
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

    const withdrawAmount = parseFloat(amount);
    if (isNaN(withdrawAmount) || withdrawAmount <= 0 || withdrawAmount > validator.rewards) {
      toast.error(`Amount must be between 0 and ${validator.rewards} SOL`);
      return;
    }

    let recipientPubkey: PublicKey;
    try {
      recipientPubkey = recipient ? new PublicKey(recipient) : multisigVault;
    } catch {
      toast.error('Invalid recipient address');
      return;
    }

    setLoading(true);
    try {
      const instruction = createWithdrawInstruction(
        validator.votePubkey,
        multisigVault,
        recipientPubkey,
        Math.floor(withdrawAmount * LAMPORTS_PER_SOL)
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
    } catch (error) {
      console.error('Error creating transaction:', error);
      toast.error('Failed to create transaction');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="w-full sm:w-auto">
          <Wallet className="h-4 w-4 sm:mr-2" />
          <span className="sm:inline">Withdraw Rewards</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Withdraw Validator Rewards</DialogTitle>
          <DialogDescription>
            Withdraw rewards from this validator. Available: {validator.rewards.toFixed(4)} SOL
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="amount">Amount (SOL)</Label>
            <Input
              id="amount"
              type="number"
              min="0"
              max={validator.rewards}
              step="0.001"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="Enter amount to withdraw"
            />
            <p className="text-xs text-muted-foreground">
              Maximum: {validator.rewards.toFixed(4)} SOL
            </p>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="recipient">Recipient (optional)</Label>
            <Input
              id="recipient"
              type="text"
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
              placeholder="Leave empty to send to Squad vault"
            />
            <p className="text-xs text-muted-foreground">
              Defaults to Squad vault if not specified
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