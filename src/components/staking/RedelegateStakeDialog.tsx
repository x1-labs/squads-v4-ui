import React, { useState } from 'react';
import {
  PublicKey,
  TransactionMessage,
  TransactionInstruction,
  VersionedTransaction,
} from '@solana/web3.js';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { useMultisigData } from '@/hooks/useMultisigData';
import { useAccess } from '@/hooks/useAccess';
import { useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { useQueryClient } from '@tanstack/react-query';
import * as multisig from '@sqds/multisig';
import { createDelegateStakeInstruction } from '@/lib/staking/validatorStakeUtils';
import { StakeAccountInfo } from '@/lib/staking/validatorStakeUtils';
import { toast } from 'sonner';
import { waitForConfirmation } from '@/lib/transactionConfirmation';
import { addMemoToInstructions } from '@/lib/utils/memoInstruction';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { RefreshCw } from 'lucide-react';

export function RedelegateStakeDialog({ stakeAccounts }: { stakeAccounts: StakeAccountInfo[] }) {
  const [open, setOpen] = useState(false);
  const [selectedStakeAccount, setSelectedStakeAccount] = useState<string>('');
  const [validatorVoteAccount, setValidatorVoteAccount] = useState('');
  const [memo, setMemo] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { connection, programId, multisigAddress } = useMultisigData();
  const isMember = useAccess();
  const wallet = useWallet();
  const walletModal = useWalletModal();
  const queryClient = useQueryClient();

  // Filter for accounts that can be re-delegated (inactive state - fully deactivated)
  // These accounts may still have a delegatedValidator field from their previous delegation
  const undelegatedAccounts = stakeAccounts.filter((account) => account.state === 'inactive');

  if (undelegatedAccounts.length === 0) {
    return null;
  }

  const handleStakeAccountChange = (value: string) => {
    setSelectedStakeAccount(value);
    // Prefill the validator with the previous delegated validator if available
    const account = undelegatedAccounts.find((acc) => acc.address === value);
    if (account?.delegatedValidator) {
      setValidatorVoteAccount(account.delegatedValidator);
    }
  };

  const handleSubmit = async () => {
    if (!selectedStakeAccount || !validatorVoteAccount) {
      setError('Please select a stake account and enter a validator address');
      return;
    }

    if (!wallet.publicKey) {
      walletModal.setVisible(true);
      return;
    }

    try {
      setIsSubmitting(true);
      setError(null);

      // Validate the validator vote account
      let validatorPubkey: PublicKey;
      try {
        validatorPubkey = new PublicKey(validatorVoteAccount);
      } catch {
        setError('Invalid validator vote account address');
        return;
      }

      const stakeAccountPubkey = new PublicKey(selectedStakeAccount);

      // Get vault PDA
      const vaultPda = multisig.getVaultPda({
        index: 0,
        multisigPda: new PublicKey(multisigAddress!),
        programId: programId ? new PublicKey(programId) : multisig.PROGRAM_ID,
      })[0];

      // Create delegate instruction
      const delegateInstruction = createDelegateStakeInstruction(
        stakeAccountPubkey,
        vaultPda,
        validatorPubkey
      );

      const instructions: TransactionInstruction[] = [delegateInstruction];
      addMemoToInstructions(instructions, memo, vaultPda);

      const multisigInfo = await multisig.accounts.Multisig.fromAccountAddress(
        // @ts-ignore
        connection,
        new PublicKey(multisigAddress!)
      );

      const blockhash = (await connection.getLatestBlockhash()).blockhash;

      const stakeMessage = new TransactionMessage({
        instructions,
        payerKey: vaultPda,
        recentBlockhash: blockhash,
      });

      const transactionIndex = Number(multisigInfo.transactionIndex) + 1;
      const transactionIndexBN = BigInt(transactionIndex);

      const multisigTransactionIx = multisig.instructions.vaultTransactionCreate({
        multisigPda: new PublicKey(multisigAddress!),
        creator: wallet.publicKey,
        ephemeralSigners: 0,
        // @ts-ignore
        transactionMessage: stakeMessage,
        transactionIndex: transactionIndexBN,
        addressLookupTableAccounts: [],
        rentPayer: wallet.publicKey,
        vaultIndex: 0,
        programId: programId ? new PublicKey(programId) : multisig.PROGRAM_ID,
      });

      const proposalIx = multisig.instructions.proposalCreate({
        multisigPda: new PublicKey(multisigAddress!),
        creator: wallet.publicKey,
        isDraft: false,
        transactionIndex: transactionIndexBN,
        rentPayer: wallet.publicKey,
        programId: programId ? new PublicKey(programId) : multisig.PROGRAM_ID,
      });

      const approveIx = multisig.instructions.proposalApprove({
        multisigPda: new PublicKey(multisigAddress!),
        member: wallet.publicKey,
        transactionIndex: transactionIndexBN,
        programId: programId ? new PublicKey(programId) : multisig.PROGRAM_ID,
      });

      const message = new TransactionMessage({
        instructions: [multisigTransactionIx, proposalIx, approveIx],
        payerKey: wallet.publicKey,
        recentBlockhash: blockhash,
      }).compileToV0Message();

      const transaction = new VersionedTransaction(message);

      toast.loading('Sending transaction...', { id: 'transaction' });
      const signature = await wallet.sendTransaction(transaction, connection, {
        skipPreflight: true,
      });

      console.log('Transaction signature', signature);
      toast.loading('Confirming...', { id: 'transaction' });

      const sent = await waitForConfirmation(connection, [signature]);
      if (!sent[0]) {
        throw `Transaction failed or unable to confirm. Check ${signature}`;
      }

      toast.success('Stake re-delegated successfully!', { id: 'transaction' });
      setOpen(false);
      setSelectedStakeAccount('');
      setValidatorVoteAccount('');
      setMemo('');
      await queryClient.invalidateQueries({ queryKey: ['transactions'] });
      await queryClient.invalidateQueries({ queryKey: ['stakeAccounts'] });
    } catch (err: any) {
      console.error('Error re-delegating stake:', err);
      toast.error(err.message || 'Failed to re-delegate stake', { id: 'transaction' });
      setError(err.message || 'Failed to re-delegate stake');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-9"
          disabled={!isMember}
          onClick={(e) => {
            if (!wallet.publicKey) {
              e.preventDefault();
              walletModal.setVisible(true);
              return;
            } else {
              setOpen(true);
            }
          }}
        >
          <RefreshCw className="mr-2 h-4 w-4" />
          Re-delegate
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Re-delegate Stake</DialogTitle>
          <DialogDescription>
            Re-delegate an undelegated stake account to a new validator.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="stake-account">Stake Account</Label>
            <Select value={selectedStakeAccount} onValueChange={handleStakeAccountChange}>
              <SelectTrigger>
                <SelectValue placeholder="Select an undelegated stake account" />
              </SelectTrigger>
              <SelectContent>
                {undelegatedAccounts.map((account) => (
                  <SelectItem key={account.address} value={account.address}>
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center justify-between gap-4">
                        <span className="font-mono text-xs">
                          {account.address.slice(0, 8)}...{account.address.slice(-8)}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {account.balance.toFixed(2)} XNT
                        </span>
                      </div>
                      {account.delegatedValidator && (
                        <span className="text-xs text-muted-foreground">
                          Previous: {account.delegatedValidator.slice(0, 6)}...
                        </span>
                      )}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="validator">Validator Vote Account</Label>
            <Input
              id="validator"
              placeholder="Enter validator vote account address"
              value={validatorVoteAccount}
              onChange={(e) => setValidatorVoteAccount(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="memo">Memo (optional)</Label>
            <Input
              id="memo"
              placeholder="Add a memo to this transaction"
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={() => setOpen(false)} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isSubmitting || !selectedStakeAccount || !validatorVoteAccount}
          >
            {isSubmitting ? 'Re-delegating...' : 'Re-delegate'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
