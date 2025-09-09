import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useState } from 'react';
import * as multisig from '@sqds/multisig';
import { useWallet } from '@solana/wallet-adapter-react';
import {
  PublicKey,
  TransactionMessage,
  TransactionInstruction,
  VersionedTransaction,
} from '@solana/web3.js';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { toast } from 'sonner';
import { useMultisigData } from '@/hooks/useMultisigData';
import { useQueryClient } from '@tanstack/react-query';
import { useAccess } from '@/hooks/useAccess';
import { waitForConfirmation } from '@/lib/transactionConfirmation';
import { addMemoToInstructions } from '@/lib/utils/memoInstruction';
import { createDeactivateStakeInstruction } from '@/lib/staking/validatorStakeUtils';
import { StakeAccountInfo } from '@/lib/staking/validatorStakeUtils';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';

type UndelegateStakeDialogProps = {
  stakeAccounts: StakeAccountInfo[];
  vaultIndex?: number;
};

export function UndelegateStakeDialog({
  stakeAccounts,
  vaultIndex = 0,
}: UndelegateStakeDialogProps) {
  const [isOpen, setIsOpen] = useState(false);
  const closeDialog = () => setIsOpen(false);
  const wallet = useWallet();
  const walletModal = useWalletModal();
  const [selectedAccount, setSelectedAccount] = useState<string>('');
  const [memo, setMemo] = useState('');
  const { connection, programId, multisigAddress } = useMultisigData();
  const queryClient = useQueryClient();
  const isMember = useAccess();

  const activeAccounts = stakeAccounts.filter(
    (account) => account.state === 'active' || account.state === 'activating'
  );

  const undelegate = async () => {
    if (!wallet.publicKey || !multisigAddress || !selectedAccount) {
      throw 'Wallet not connected or no account selected';
    }

    const vaultAddress = multisig.getVaultPda({
      index: vaultIndex,
      multisigPda: new PublicKey(multisigAddress),
      programId: programId ? new PublicKey(programId) : multisig.PROGRAM_ID,
    })[0];

    const deactivateInstruction = createDeactivateStakeInstruction(
      new PublicKey(selectedAccount),
      vaultAddress
    );

    const instructions: TransactionInstruction[] = [deactivateInstruction];
    addMemoToInstructions(instructions, memo, vaultAddress);

    const multisigInfo = await multisig.accounts.Multisig.fromAccountAddress(
      // @ts-ignore
      connection,
      new PublicKey(multisigAddress)
    );

    const blockhash = (await connection.getLatestBlockhash()).blockhash;

    const undelegateMessage = new TransactionMessage({
      instructions,
      payerKey: vaultAddress,
      recentBlockhash: blockhash,
    });

    const transactionIndex = Number(multisigInfo.transactionIndex) + 1;
    const transactionIndexBN = BigInt(transactionIndex);

    const multisigTransactionIx = multisig.instructions.vaultTransactionCreate({
      multisigPda: new PublicKey(multisigAddress),
      creator: wallet.publicKey,
      ephemeralSigners: 0,
      // @ts-ignore
      transactionMessage: undelegateMessage,
      transactionIndex: transactionIndexBN,
      addressLookupTableAccounts: [],
      rentPayer: wallet.publicKey,
      vaultIndex: vaultIndex,
      programId: programId ? new PublicKey(programId) : multisig.PROGRAM_ID,
    });

    const proposalIx = multisig.instructions.proposalCreate({
      multisigPda: new PublicKey(multisigAddress),
      creator: wallet.publicKey,
      isDraft: false,
      transactionIndex: transactionIndexBN,
      rentPayer: wallet.publicKey,
      programId: programId ? new PublicKey(programId) : multisig.PROGRAM_ID,
    });

    const approveIx = multisig.instructions.proposalApprove({
      multisigPda: new PublicKey(multisigAddress),
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

    const signature = await wallet.sendTransaction(transaction, connection, {
      skipPreflight: true,
    });

    console.log('Transaction signature', signature);
    toast.loading('Confirming...', { id: 'transaction' });

    const sent = await waitForConfirmation(connection, [signature]);
    if (!sent[0]) {
      throw `Transaction failed or unable to confirm. Check ${signature}`;
    }

    setSelectedAccount('');
    setMemo('');
    closeDialog();
    await queryClient.invalidateQueries({ queryKey: ['transactions'] });
    await queryClient.invalidateQueries({ queryKey: ['stakeAccounts'] });
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          disabled={!isMember || activeAccounts.length === 0}
          onClick={(e) => {
            if (!wallet.publicKey) {
              e.preventDefault();
              walletModal.setVisible(true);
              return;
            } else {
              setIsOpen(true);
            }
          }}
        >
          Undelegate
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Undelegate Stake</DialogTitle>
          <DialogDescription>
            Deactivate a stake account. After deactivation, you'll need to wait for the cooldown
            period before withdrawing.
          </DialogDescription>
        </DialogHeader>

        <Select value={selectedAccount} onValueChange={setSelectedAccount}>
          <SelectTrigger>
            <SelectValue placeholder="Select stake account to undelegate" />
          </SelectTrigger>
          <SelectContent>
            {activeAccounts.map((account) => (
              <SelectItem key={account.address} value={account.address}>
                <div className="flex w-full items-center justify-between">
                  <span className="font-mono text-xs">
                    {account.address.slice(0, 8)}...{account.address.slice(-8)}
                  </span>
                  <span className="ml-2 text-xs text-muted-foreground">
                    {account.balance.toFixed(2)} XNT
                  </span>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Input
          placeholder="Memo (optional)"
          type="text"
          value={memo}
          onChange={(e) => setMemo(e.target.value)}
          maxLength={200}
        />
        {memo.length > 0 && (
          <p className="text-xs text-muted-foreground">{memo.length}/200 characters</p>
        )}

        <Button
          onClick={() =>
            toast.promise(undelegate, {
              id: 'transaction',
              loading: 'Creating undelegate transaction...',
              success: 'Undelegate proposed.',
              error: (e) => `Failed to propose: ${e}`,
            })
          }
          disabled={!selectedAccount}
        >
          Undelegate Stake
        </Button>
      </DialogContent>
    </Dialog>
  );
}
