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
import { Label } from '@/components/ui/label';
import { useState } from 'react';
import * as multisig from '@sqds/multisig';
import { useWallet } from '@solana/wallet-adapter-react';
import {
  PublicKey,
  TransactionMessage,
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
import { createSplitStakeInstructions } from '@/lib/staking/validatorStakeUtils';
import { StakeAccountInfo as StakeAccountData } from '@/lib/staking/validatorStakeUtils';
import { formatXNTCompact } from '@/lib/utils/formatters';
import { AlertCircle, Split } from 'lucide-react';
import { StakeAccountDisplay } from './StakeAccountDisplay';

type SplitStakeDialogProps = {
  vaultIndex?: number;
  isOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  preSelectedAccount?: StakeAccountData;
};

export function SplitStakeDialog({
  vaultIndex = 0,
  isOpen: externalIsOpen,
  onOpenChange: externalOnOpenChange,
  preSelectedAccount,
}: SplitStakeDialogProps) {
  const [internalIsOpen, setInternalIsOpen] = useState(false);
  const isOpen = externalIsOpen !== undefined ? externalIsOpen : internalIsOpen;
  const setIsOpen = externalOnOpenChange || setInternalIsOpen;
  const closeDialog = () => setIsOpen(false);

  const wallet = useWallet();
  const walletModal = useWalletModal();
  const [amount, setAmount] = useState<string>('');
  const [memo, setMemo] = useState('');
  const { connection, programId, multisigAddress } = useMultisigData();
  const queryClient = useQueryClient();
  const isMember = useAccess();

  if (!preSelectedAccount) {
    return null;
  }

  // Calculate max splitable amount (must leave some amount in original account)
  const maxSplitable = Math.max(
    0,
    preSelectedAccount.balance - preSelectedAccount.rentExemptReserve - 0.1
  ); // Leave 0.1 XNT minimum

  const parsedAmount = parseFloat(amount);
  const isAmountValid = !isNaN(parsedAmount) && parsedAmount > 0 && parsedAmount <= maxSplitable;

  const splitStake = async () => {
    if (!wallet.publicKey || !multisigAddress || !preSelectedAccount) {
      throw 'Wallet not connected or no account selected';
    }

    const vaultAddress = multisig.getVaultPda({
      index: vaultIndex,
      multisigPda: new PublicKey(multisigAddress),
      programId: programId ? new PublicKey(programId) : multisig.PROGRAM_ID,
    })[0];

    const lamports = parsedAmount * LAMPORTS_PER_SOL;

    // Use timestamp as unique seed for the new stake account
    const seed = `split-${Date.now()}`.substring(0, 32);

    const { instructions } = await createSplitStakeInstructions(
      new PublicKey(preSelectedAccount.address),
      vaultAddress,
      lamports,
      seed,
      connection
    );

    addMemoToInstructions(instructions, memo, vaultAddress);

    const multisigInfo = await multisig.accounts.Multisig.fromAccountAddress(
      // @ts-ignore
      connection,
      new PublicKey(multisigAddress)
    );

    const blockhash = (await connection.getLatestBlockhash()).blockhash;

    const splitMessage = new TransactionMessage({
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
      transactionMessage: splitMessage,
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

    setAmount('');
    setMemo('');
    closeDialog();
    await queryClient.invalidateQueries({ queryKey: ['transactions'] });
    await queryClient.invalidateQueries({ queryKey: ['stakeAccounts'] });
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      {externalIsOpen === undefined && (
        <DialogTrigger asChild>
          <Button
            variant="outline"
            disabled={!isMember || maxSplitable <= 0}
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
            Split Stake
          </Button>
        </DialogTrigger>
      )}
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Split className="h-5 w-5" />
            Split Stake
          </DialogTitle>
          <DialogDescription>
            Split a portion of this stake account into a new stake account.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Account Info */}
          <StakeAccountDisplay account={preSelectedAccount} />

          {/* Account Balance Info */}
          <div className="rounded-lg border bg-muted/50 p-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="mb-1 text-xs text-muted-foreground">Total Balance</p>
                <p className="font-medium">
                  {preSelectedAccount.balance.toLocaleString(undefined, {
                    maximumFractionDigits: 2,
                  })}{' '}
                  XNT
                </p>
              </div>
              <div>
                <p className="mb-1 text-xs text-muted-foreground">Max Splitable</p>
                <p className="font-medium">
                  {maxSplitable.toLocaleString(undefined, {
                    maximumFractionDigits: 2,
                  })}{' '}
                  XNT
                </p>
              </div>
            </div>
            {maxSplitable <= 0 && (
              <div className="mt-3 flex items-center gap-1 text-xs text-yellow-600">
                <AlertCircle className="h-3 w-3" />
                <span>Account balance too low to split</span>
              </div>
            )}
          </div>

          {/* Amount Input */}
          <div className="space-y-2">
            <Label htmlFor="amount">Split Amount</Label>
            <div className="space-y-2">
              <Input
                id="amount"
                placeholder={
                  maxSplitable > 0
                    ? `Enter amount (max ${maxSplitable.toFixed(2)})`
                    : 'No splitable amount'
                }
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                disabled={maxSplitable <= 0}
                className="text-lg"
              />
              {maxSplitable > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setAmount(maxSplitable.toString())}
                  className="w-full"
                >
                  <span className="truncate">
                    Max • {formatXNTCompact(maxSplitable * LAMPORTS_PER_SOL)}
                  </span>
                </Button>
              )}
            </div>

            {/* Validation Messages */}
            {amount && !isAmountValid && (
              <div className="flex items-center gap-1 text-xs text-red-500">
                <AlertCircle className="h-3 w-3" />
                <span>
                  {parsedAmount <= 0
                    ? 'Amount must be greater than 0'
                    : `Max splitable: ${maxSplitable.toFixed(2)} XNT`}
                </span>
              </div>
            )}
          </div>

          {/* Memo Input */}
          <div className="space-y-2">
            <Label htmlFor="memo">Memo (Optional)</Label>
            <Input
              id="memo"
              placeholder="Add a note for this split"
              type="text"
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              maxLength={200}
            />
            {memo.length > 0 && (
              <p className="text-right text-xs text-muted-foreground">{memo.length}/200</p>
            )}
          </div>

          {/* Submit Button */}
          <Button
            onClick={() =>
              toast.promise(splitStake, {
                id: 'transaction',
                loading: 'Creating split transaction...',
                success: 'Split proposed.',
                error: (e) => `Failed to propose: ${e}`,
              })
            }
            disabled={!isAmountValid || maxSplitable <= 0}
            className="w-full"
            size="lg"
          >
            <Split className="mr-2 h-4 w-4" />
            Split Stake
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
