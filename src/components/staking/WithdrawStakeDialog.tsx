import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useState } from 'react';
import * as multisig from '@sqds/multisig';
import { useWallet } from '@solana/wallet-adapter-react';
import {
  PublicKey,
  TransactionMessage,
  TransactionInstruction,
  VersionedTransaction,
  LAMPORTS_PER_SOL,
} from '@solana/web3.js';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { toast } from 'sonner';
import { useMultisigData } from '@/hooks/useMultisigData';
import { useQueryClient } from '@tanstack/react-query';
import { useAccess } from '@/hooks/useAccess';
import { waitForConfirmation } from '@/lib/transactionConfirmation';
import { addMemoToInstructions } from '@/lib/utils/memoInstruction';
import { createWithdrawStakeInstruction } from '@/lib/staking/validatorStakeUtils';
import { StakeAccountInfo } from '@/lib/staking/validatorStakeUtils';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

type WithdrawStakeDialogProps = {
  stakeAccounts: StakeAccountInfo[];
  vaultIndex?: number;
};

export function WithdrawStakeDialog({ stakeAccounts, vaultIndex = 0 }: WithdrawStakeDialogProps) {
  const [isOpen, setIsOpen] = useState(false);
  const closeDialog = () => setIsOpen(false);
  const wallet = useWallet();
  const walletModal = useWalletModal();
  const [selectedAccount, setSelectedAccount] = useState<string>('');
  const [amount, setAmount] = useState<string>('');
  const [memo, setMemo] = useState('');
  const { connection, programId, multisigAddress } = useMultisigData();
  const queryClient = useQueryClient();
  const isMember = useAccess();

  // All stake accounts can potentially have withdrawals
  // Active accounts can withdraw excess, inactive can withdraw all
  const withdrawableAccounts = stakeAccounts;

  const selectedAccountInfo = withdrawableAccounts.find((acc) => acc.address === selectedAccount);

  // Calculate max withdrawable based on account state
  let maxWithdrawable = 0;
  if (selectedAccountInfo) {
    if (selectedAccountInfo.state === 'inactive') {
      // Inactive accounts can withdraw everything minus rent
      maxWithdrawable = selectedAccountInfo.balance - selectedAccountInfo.rentExemptReserve;
    } else if (selectedAccountInfo.state === 'deactivating') {
      // Deactivating accounts can withdraw the deactivating amount
      maxWithdrawable = selectedAccountInfo.balance - selectedAccountInfo.rentExemptReserve;
    } else if (
      selectedAccountInfo.state === 'active' ||
      selectedAccountInfo.state === 'activating'
    ) {
      // Active/activating accounts can only withdraw excess above staked amount
      const stakedAmount = selectedAccountInfo.activeStake || 0;
      const excessAmount =
        selectedAccountInfo.balance - stakedAmount - selectedAccountInfo.rentExemptReserve;
      maxWithdrawable = Math.max(0, excessAmount);
    }
  }

  const parsedAmount = parseFloat(amount);
  const isAmountValid = !isNaN(parsedAmount) && parsedAmount > 0 && parsedAmount <= maxWithdrawable;

  const withdrawStake = async () => {
    if (!wallet.publicKey || !multisigAddress || !selectedAccount) {
      throw 'Wallet not connected or no account selected';
    }

    const vaultAddress = multisig.getVaultPda({
      index: vaultIndex,
      multisigPda: new PublicKey(multisigAddress),
      programId: programId ? new PublicKey(programId) : multisig.PROGRAM_ID,
    })[0];

    const lamports = parsedAmount * LAMPORTS_PER_SOL;

    const withdrawInstruction = createWithdrawStakeInstruction(
      new PublicKey(selectedAccount),
      vaultAddress,
      lamports
    );

    const instructions: TransactionInstruction[] = [withdrawInstruction];
    addMemoToInstructions(instructions, memo, vaultAddress);

    const multisigInfo = await multisig.accounts.Multisig.fromAccountAddress(
      // @ts-ignore
      connection,
      new PublicKey(multisigAddress)
    );

    const blockhash = (await connection.getLatestBlockhash()).blockhash;

    const withdrawMessage = new TransactionMessage({
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
      transactionMessage: withdrawMessage,
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
    setAmount('');
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
          disabled={!isMember || stakeAccounts.length === 0}
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
          Withdraw
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Withdraw Stake</DialogTitle>
          <DialogDescription>Withdraw XNT from deactivated stake accounts</DialogDescription>
        </DialogHeader>

        <Select value={selectedAccount} onValueChange={setSelectedAccount}>
          <SelectTrigger>
            <SelectValue placeholder="Select stake account to withdraw from" />
          </SelectTrigger>
          <SelectContent>
            {withdrawableAccounts.map((account) => (
              <SelectItem key={account.address} value={account.address}>
                <div className="flex flex-col">
                  <span className="font-mono text-xs">
                    {account.address.slice(0, 8)}...{account.address.slice(-8)}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {account.balance.toFixed(2)} XNT ({account.state})
                  </span>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {selectedAccountInfo && (
          <div className="space-y-1 text-xs text-muted-foreground">
            <div>Status: {selectedAccountInfo.state}</div>
            <div>Total balance: {selectedAccountInfo.balance.toFixed(4)} XNT</div>
            {selectedAccountInfo.activeStake !== undefined && (
              <div>Active stake: {selectedAccountInfo.activeStake.toFixed(4)} XNT</div>
            )}
            <div>Rent reserve: {selectedAccountInfo.rentExemptReserve.toFixed(4)} XNT</div>
            <div className="font-medium">
              Max withdrawable: {maxWithdrawable.toFixed(4)} XNT
              {maxWithdrawable === 0 && selectedAccountInfo.state === 'active' && (
                <span className="text-yellow-600"> (undelegate first to withdraw stake)</span>
              )}
            </div>
          </div>
        )}

        <div className="space-y-2">
          <Input
            placeholder={`Amount (max ${maxWithdrawable.toFixed(4)} XNT)`}
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            disabled={!selectedAccount || maxWithdrawable === 0}
          />
          {selectedAccountInfo && maxWithdrawable > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setAmount(maxWithdrawable.toString())}
              className="w-full"
            >
              Max ({maxWithdrawable.toFixed(4)} XNT)
            </Button>
          )}
        </div>
        {amount && !isAmountValid && (
          <p className="text-xs text-red-500">
            Invalid amount. Max withdrawable: {maxWithdrawable.toFixed(4)} XNT
          </p>
        )}

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
            toast.promise(withdrawStake, {
              id: 'transaction',
              loading: 'Creating withdraw transaction...',
              success: 'Withdraw proposed.',
              error: (e) => `Failed to propose: ${e}`,
            })
          }
          disabled={!selectedAccount || !isAmountValid}
        >
          Withdraw Stake
        </Button>
      </DialogContent>
    </Dialog>
  );
}
