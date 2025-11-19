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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
import {
  createMergeStakeInstruction,
  getCompatibleMergeAccounts,
} from '@/lib/staking/validatorStakeUtils';
import { StakeAccountInfo as StakeAccountData } from '@/lib/staking/validatorStakeUtils';
import { useValidatorsMetadata } from '@/hooks/useValidatorMetadata';
import { AlertCircle, Merge, ArrowRight } from 'lucide-react';
import { StakeAccountDisplay } from './StakeAccountDisplay';

type MergeStakeDialogProps = {
  vaultIndex?: number;
  isOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  preSelectedAccount?: StakeAccountData;
  allStakeAccounts: StakeAccountData[];
};

export function MergeStakeDialog({
  vaultIndex = 0,
  isOpen: externalIsOpen,
  onOpenChange: externalOnOpenChange,
  preSelectedAccount,
  allStakeAccounts,
}: MergeStakeDialogProps) {
  const [internalIsOpen, setInternalIsOpen] = useState(false);
  const isOpen = externalIsOpen !== undefined ? externalIsOpen : internalIsOpen;
  const setIsOpen = externalOnOpenChange || setInternalIsOpen;
  const closeDialog = () => setIsOpen(false);

  const wallet = useWallet();
  const walletModal = useWalletModal();
  const [selectedSourceAccount, setSelectedSourceAccount] = useState<string>('');
  const [memo, setMemo] = useState('');
  const { connection, programId, multisigAddress } = useMultisigData();
  const queryClient = useQueryClient();
  const isMember = useAccess();

  if (!preSelectedAccount) {
    return null;
  }

  // Get compatible accounts for merging
  const compatibleAccounts = getCompatibleMergeAccounts(preSelectedAccount, allStakeAccounts);

  // Get validator metadata for compatible accounts
  const validatorAddresses = compatibleAccounts
    .map((account) => account.delegatedValidator)
    .filter((v): v is string => !!v);
  const { data: validatorMetadata } = useValidatorsMetadata(validatorAddresses);

  const selectedSourceAccountInfo = compatibleAccounts.find(
    (account) => account.address === selectedSourceAccount
  );

  const combinedBalance = selectedSourceAccountInfo
    ? preSelectedAccount.balance +
      selectedSourceAccountInfo.balance -
      selectedSourceAccountInfo.rentExemptReserve
    : preSelectedAccount.balance;

  const mergeStake = async () => {
    if (!wallet.publicKey || !multisigAddress || !selectedSourceAccount) {
      throw 'Wallet not connected or no source account selected';
    }

    const vaultAddress = multisig.getVaultPda({
      index: vaultIndex,
      multisigPda: new PublicKey(multisigAddress),
      programId: programId ? new PublicKey(programId) : multisig.PROGRAM_ID,
    })[0];

    // Create merge instruction
    const mergeInstruction = createMergeStakeInstruction(
      new PublicKey(preSelectedAccount.address), // destination
      new PublicKey(selectedSourceAccount), // source
      vaultAddress
    );

    const instructions: TransactionInstruction[] = [mergeInstruction];
    addMemoToInstructions(instructions, memo, vaultAddress);

    const multisigInfo = await multisig.accounts.Multisig.fromAccountAddress(
      // @ts-ignore
      connection,
      new PublicKey(multisigAddress)
    );

    const blockhash = (await connection.getLatestBlockhash()).blockhash;

    const mergeMessage = new TransactionMessage({
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
      transactionMessage: mergeMessage,
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

    // Sign transaction first, then send manually to avoid "Plugin Closed" errors
    if (!wallet.signTransaction) {
      throw new Error('Wallet does not support transaction signing');
    }

    const signedTransaction = await wallet.signTransaction(transaction);
    const signature = await connection.sendRawTransaction(signedTransaction.serialize(), {
      skipPreflight: false,
      maxRetries: 3,
    });

    console.log('Transaction signature', signature);
    toast.loading('Confirming...', { id: 'transaction' });

    const sent = await waitForConfirmation(connection, [signature]);
    if (!sent[0]) {
      throw `Transaction failed or unable to confirm. Check ${signature}`;
    }

    setSelectedSourceAccount('');
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
            disabled={!isMember || compatibleAccounts.length === 0}
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
            Merge Stakes
          </Button>
        </DialogTrigger>
      )}
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Merge className="h-5 w-5" />
            Merge Stakes
          </DialogTitle>
          <DialogDescription>
            Merge another compatible stake account into this one. The source account will be closed.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Destination Account (Current) */}
          <div>
            <Label className="text-sm font-medium">
              Destination Account (will receive merged funds)
            </Label>
            <div className="mt-2">
              <StakeAccountDisplay account={preSelectedAccount} />
            </div>
          </div>

          {/* Source Account Selection */}
          <div className="space-y-2">
            <Label htmlFor="sourceAccount">Source Account (will be closed)</Label>
            {compatibleAccounts.length === 0 ? (
              <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-3 text-sm text-yellow-700 dark:border-yellow-800 dark:bg-yellow-950/30 dark:text-yellow-400">
                <div className="flex items-center gap-2">
                  <AlertCircle className="h-4 w-4" />
                  <span>No compatible accounts available for merging</span>
                </div>
                <p className="mt-1 text-xs">
                  Compatible accounts must have matching states, validators, and authorities.
                </p>
              </div>
            ) : (
              <Select value={selectedSourceAccount} onValueChange={setSelectedSourceAccount}>
                <SelectTrigger>
                  <SelectValue placeholder="Select account to merge from" />
                </SelectTrigger>
                <SelectContent>
                  {compatibleAccounts.map((account) => (
                    <SelectItem key={account.address} value={account.address}>
                      <div className="flex items-center gap-2">
                        <div className="flex items-center gap-1">
                          {validatorMetadata?.get(account.delegatedValidator || '')?.avatarUrl && (
                            <img
                              src={validatorMetadata.get(account.delegatedValidator!)!.avatarUrl}
                              alt="Validator"
                              className="h-4 w-4 rounded-full"
                              onError={(e) => {
                                (e.target as HTMLImageElement).style.display = 'none';
                              }}
                            />
                          )}
                          <span className="font-mono text-xs">
                            {account.address.slice(0, 8)}...{account.address.slice(-8)}
                          </span>
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {account.balance.toLocaleString(undefined, { maximumFractionDigits: 2 })}{' '}
                          XNT
                        </span>
                        <span
                          className={`text-xs capitalize text-muted-foreground ${
                            account.state === 'active'
                              ? 'text-green-600'
                              : account.state === 'activating'
                                ? 'text-yellow-600'
                                : account.state === 'deactivating'
                                  ? 'text-orange-600'
                                  : 'text-gray-600'
                          }`}
                        >
                          ({account.state})
                        </span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {/* Merge Preview */}
          {selectedSourceAccountInfo && (
            <div className="rounded-lg border bg-muted/50 p-4">
              <div className="mb-3 flex items-center gap-2">
                <Merge className="h-4 w-4" />
                <span className="text-sm font-medium">Merge Preview</span>
              </div>
              <div className="grid grid-cols-3 items-center gap-4 text-sm">
                <div className="text-center">
                  <p className="text-xs text-muted-foreground">Current</p>
                  <p className="font-medium">
                    {preSelectedAccount.balance.toLocaleString(undefined, {
                      maximumFractionDigits: 2,
                    })}{' '}
                    XNT
                  </p>
                </div>
                <div className="flex justify-center">
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="text-center">
                  <p className="text-xs text-muted-foreground">After Merge</p>
                  <p className="font-medium text-green-600">
                    {combinedBalance.toLocaleString(undefined, {
                      maximumFractionDigits: 2,
                    })}{' '}
                    XNT
                  </p>
                </div>
              </div>
              <div className="mt-3 rounded bg-yellow-50 p-2 text-xs text-yellow-700 dark:bg-yellow-950/30 dark:text-yellow-400">
                <div className="flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" />
                  <span>Source account will be permanently closed</span>
                </div>
              </div>
            </div>
          )}

          {/* Memo Input */}
          <div className="space-y-2">
            <Label htmlFor="memo">Memo (Optional)</Label>
            <Input
              id="memo"
              placeholder="Add a note for this merge"
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
              toast.promise(mergeStake, {
                id: 'transaction',
                loading: 'Creating merge transaction...',
                success: 'Merge proposed.',
                error: (e) => `Failed to propose: ${e}`,
              })
            }
            disabled={!selectedSourceAccount || compatibleAccounts.length === 0}
            className="w-full"
            size="lg"
          >
            <Merge className="mr-2 h-4 w-4" />
            Merge Stakes
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
