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
import { StakeAccountInfo as StakeAccountData } from '@/lib/staking/validatorStakeUtils';
import { useValidatorsMetadata } from '@/hooks/useValidatorMetadata';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { formatXNTCompact } from '@/lib/utils/formatters';
import { AlertCircle, Wallet, ArrowDown } from 'lucide-react';
import { StakeAccountDisplay } from './StakeAccountDisplay';

type WithdrawStakeDialogProps = {
  stakeAccounts?: StakeAccountData[];
  vaultIndex?: number;
  isOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  preSelectedAccount?: StakeAccountData;
};

export function WithdrawStakeDialog({
  stakeAccounts = [],
  vaultIndex = 0,
  isOpen: externalIsOpen,
  onOpenChange: externalOnOpenChange,
  preSelectedAccount,
}: WithdrawStakeDialogProps) {
  const [internalIsOpen, setInternalIsOpen] = useState(false);
  const isOpen = externalIsOpen !== undefined ? externalIsOpen : internalIsOpen;
  const setIsOpen = externalOnOpenChange || setInternalIsOpen;
  const closeDialog = () => setIsOpen(false);

  const wallet = useWallet();
  const walletModal = useWalletModal();
  const [selectedAccount, setSelectedAccount] = useState<string>(preSelectedAccount?.address || '');
  const [amount, setAmount] = useState<string>('');
  const [memo, setMemo] = useState('');
  const { connection, programId, multisigAddress } = useMultisigData();
  const queryClient = useQueryClient();
  const isMember = useAccess();

  // All stake accounts can potentially have withdrawals
  // Active accounts can withdraw excess, inactive can withdraw all
  const withdrawableAccounts = stakeAccounts;

  // Get unique validator addresses for metadata
  const validatorAddresses = [
    ...withdrawableAccounts.map((account) => account.delegatedValidator),
    preSelectedAccount?.delegatedValidator,
  ].filter((v): v is string => !!v);

  const { data: validatorMetadata } = useValidatorsMetadata(validatorAddresses);

  const selectedAccountInfo =
    preSelectedAccount || withdrawableAccounts.find((acc) => acc.address === selectedAccount);

  // Calculate max withdrawable based on account state with safe buffer
  // Based on Solana stake program validation:
  // - lamports_and_reserve = lamports + reserve
  // - if is_staked && lamports_and_reserve > stake_account.get_lamports() => error
  // - if not full withdrawal && lamports_and_reserve > stake_account.get_lamports() => error
  let maxWithdrawable = 0;
  let maxWithdrawableWithRent = 0; // Full balance including rent (closes account)

  const SAFETY_BUFFER_PERCENT = 0.01; // 1% safety buffer to prevent edge cases

  if (selectedAccountInfo) {
    const totalBalance = selectedAccountInfo.balance;
    const rentReserve = selectedAccountInfo.rentExemptReserve;
    const isStaked =
      selectedAccountInfo.state === 'active' || selectedAccountInfo.state === 'activating';
    if (selectedAccountInfo.state === 'inactive') {
      // Inactive accounts can withdraw everything without buffer
      // For non-full withdrawal: lamports + reserve <= total_balance
      // Max safe withdrawal = total_balance - reserve
      maxWithdrawable = Math.max(0, totalBalance - rentReserve);
      // For full withdrawal (account closure): can withdraw everything
      maxWithdrawableWithRent = totalBalance;
    } else if (selectedAccountInfo.state === 'deactivating') {
      // Deactivating accounts can only withdraw the inactive portion
      const inactiveAmount = selectedAccountInfo.inactiveStake || 0;
      const safetyBuffer = inactiveAmount * SAFETY_BUFFER_PERCENT;
      maxWithdrawable = Math.max(0, inactiveAmount - safetyBuffer);
      // For account closure, can withdraw full inactive amount + rent exempt portion
      maxWithdrawableWithRent = Math.max(0, inactiveAmount + rentReserve);
    }
  }

  const parsedAmount = parseFloat(amount);
  const isAmountValid =
    !isNaN(parsedAmount) && parsedAmount > 0 && parsedAmount <= maxWithdrawableWithRent + 0.001; // Small tolerance for floating point precision
  const isClosingAccount =
    Math.abs(parsedAmount - maxWithdrawableWithRent) < 0.001 && maxWithdrawableWithRent > 0;

  const withdrawStake = async () => {
    if (!wallet.publicKey || !multisigAddress || !selectedAccountInfo) {
      throw 'Wallet not connected or no account selected';
    }

    const vaultAddress = multisig.getVaultPda({
      index: vaultIndex,
      multisigPda: new PublicKey(multisigAddress),
      programId: programId ? new PublicKey(programId) : multisig.PROGRAM_ID,
    })[0];

    const lamports = parsedAmount * LAMPORTS_PER_SOL;

    const withdrawInstruction = createWithdrawStakeInstruction(
      new PublicKey(selectedAccountInfo.address),
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
      {externalIsOpen === undefined && (
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
      )}
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wallet className="h-5 w-5" />
            Withdraw Stake
          </DialogTitle>
          <DialogDescription>
            Withdraw XNT from stake accounts. Fully deactivated accounts can be closed.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Account Info - No Selection Needed */}
          {selectedAccountInfo && <StakeAccountDisplay account={selectedAccountInfo} />}

          {/* Account Details */}
          {selectedAccountInfo && (
            <div className="space-y-3 rounded-lg border bg-muted/50 p-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="mb-1 text-xs text-muted-foreground">Status</p>
                  <p
                    className={`font-medium capitalize ${
                      selectedAccountInfo.state === 'active'
                        ? 'text-green-600'
                        : selectedAccountInfo.state === 'inactive'
                          ? 'text-gray-600'
                          : selectedAccountInfo.state === 'deactivating'
                            ? 'text-orange-600'
                            : 'text-yellow-600'
                    }`}
                  >
                    {selectedAccountInfo.state}
                  </p>
                </div>
                <div>
                  <p className="mb-1 text-xs text-muted-foreground">Total Balance</p>
                  <p
                    className="font-medium"
                    title={`${selectedAccountInfo.balance.toFixed(9)} XNT`}
                  >
                    {formatXNTCompact(selectedAccountInfo.balance * LAMPORTS_PER_SOL)}
                  </p>
                </div>
                {selectedAccountInfo.activeStake !== undefined &&
                  selectedAccountInfo.activeStake > 0 && (
                    <div>
                      <p className="mb-1 text-xs text-muted-foreground">Active Stake</p>
                      <p
                        className="font-medium"
                        title={`${selectedAccountInfo.activeStake.toFixed(9)} XNT`}
                      >
                        {formatXNTCompact(selectedAccountInfo.activeStake * LAMPORTS_PER_SOL)}
                      </p>
                    </div>
                  )}
                <div>
                  <p className="mb-1 text-xs text-muted-foreground">Rent Reserve</p>
                  <p className="font-medium">
                    {selectedAccountInfo.rentExemptReserve.toFixed(4)} XNT
                  </p>
                </div>
              </div>

              {/* Withdrawable Amount Display */}
              <div className="border-t pt-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Max Withdrawable</span>
                  <span
                    className="text-lg font-semibold"
                    title={`${maxWithdrawable.toFixed(9)} XNT`}
                  >
                    {formatXNTCompact(maxWithdrawable * LAMPORTS_PER_SOL)}
                  </span>
                </div>
                {maxWithdrawable === 0 &&
                  (selectedAccountInfo.state === 'active' ||
                    selectedAccountInfo.state === 'activating') && (
                    <div className="mt-2 flex items-center gap-1 text-xs text-yellow-600">
                      <AlertCircle className="h-3 w-3" />
                      <span>Account balance too low for safe withdrawal</span>
                    </div>
                  )}
                {maxWithdrawable === 0 && selectedAccountInfo.state === 'deactivating' && (
                  <div className="mt-2 flex items-center gap-1 text-xs text-yellow-600">
                    <AlertCircle className="h-3 w-3" />
                    <span>Wait for deactivation to complete or account balance too low</span>
                  </div>
                )}
                {maxWithdrawableWithRent > maxWithdrawable && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    💡 Withdraw {formatXNTCompact(maxWithdrawableWithRent * LAMPORTS_PER_SOL)} to
                    close account
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Amount Input */}
          <div className="space-y-2">
            <Label htmlFor="amount">Withdrawal Amount</Label>
            <div className="space-y-2">
              <Input
                id="amount"
                placeholder={maxWithdrawable > 0 ? `Enter amount` : 'No withdrawable amount'}
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                disabled={!selectedAccount || maxWithdrawable === 0}
                className="text-lg"
              />
              {selectedAccountInfo && maxWithdrawable > 0 && (
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setAmount(maxWithdrawable.toFixed(2))}
                    className="w-full"
                  >
                    <span className="truncate">
                      Max • {formatXNTCompact(maxWithdrawable * LAMPORTS_PER_SOL)}
                    </span>
                  </Button>
                  {maxWithdrawableWithRent > maxWithdrawable &&
                    selectedAccountInfo.state !== 'deactivating' && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setAmount(maxWithdrawableWithRent.toString())}
                        className="w-full"
                      >
                        <span className="truncate">
                          Close • {formatXNTCompact(maxWithdrawableWithRent * LAMPORTS_PER_SOL)}
                        </span>
                      </Button>
                    )}
                </div>
              )}
            </div>

            {/* Validation Messages */}
            {amount && !isAmountValid && (
              <div className="flex items-center gap-1 text-xs text-red-500">
                <AlertCircle className="h-3 w-3" />
                <span>
                  Max withdrawable: {formatXNTCompact(maxWithdrawableWithRent * LAMPORTS_PER_SOL)}
                </span>
              </div>
            )}
            {selectedAccountInfo &&
              maxWithdrawable > 0 &&
              selectedAccountInfo.state === 'deactivating' && (
                <div className="mt-1 text-xs text-muted-foreground">
                  💡 Includes 1% safety buffer for deactivating stakes to prevent Solana validation
                  errors
                </div>
              )}
            {isClosingAccount && (
              <div className="flex items-center gap-2 rounded-lg bg-yellow-50 p-3 text-xs text-yellow-700 dark:bg-yellow-950/30 dark:text-yellow-400">
                <AlertCircle className="h-4 w-4 flex-shrink-0" />
                <span>
                  This withdrawal will close the stake account and return all funds including rent.
                </span>
              </div>
            )}
          </div>

          {/* Memo Input */}
          <div className="space-y-2">
            <Label htmlFor="memo">Memo (Optional)</Label>
            <Input
              id="memo"
              placeholder="Add a note for this withdrawal"
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
              toast.promise(withdrawStake, {
                id: 'transaction',
                loading: 'Creating withdraw transaction...',
                success: 'Withdraw proposed.',
                error: (e) => `Failed to propose: ${e}`,
              })
            }
            disabled={!selectedAccountInfo || !isAmountValid}
            className="w-full"
            size="lg"
          >
            {isClosingAccount ? (
              <>
                <Wallet className="mr-2 h-4 w-4" />
                Withdraw & Close Account
              </>
            ) : (
              <>
                <ArrowDown className="mr-2 h-4 w-4" />
                Withdraw Stake
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
