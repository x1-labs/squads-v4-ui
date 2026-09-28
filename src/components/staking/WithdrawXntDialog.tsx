import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '../ui/dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Textarea } from '../ui/textarea';
import { useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { PublicKey, TransactionMessage } from '@solana/web3.js';
import * as multisig from '@sqds/multisig';
import { toast } from 'sonner';
import { useMultisigData } from '@/hooks/useMultisigData';
import { useNativeSymbol } from '@/hooks/useNativeSymbol';
import { useStakePools } from '@/hooks/useStakePools';
import { useMultisig } from '@/hooks/useServices';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { signSendAndConfirmV0 } from '@/lib/transaction/signSendAndConfirm';
import { toastSteps } from '@/lib/transaction/toastSteps';
import { useAccess } from '@/hooks/useAccess';
import { createMemoInstruction } from '@/lib/utils/memoInstruction';
import { useStakePoolProgramId } from '@/hooks/useSettings';
import { simulateVaultInstructions } from '@/lib/transaction/simulateVaultInstructions';
import { fetchWithdrawSolContext, type WithdrawSolContext } from '@/lib/staking/withdrawSolContext';
import {
  createWithdrawSolInstruction,
  describeWithdrawSolSimulationError,
} from '@/lib/staking/withdrawSolInstruction';
import {
  formatTokenAmount,
  parseTokenAmount,
  quoteWithdrawSol,
} from '@/lib/staking/withdrawSolMath';

const LAMPORT_DECIMALS = 9;

/** Thousands separators and at most 4 decimals, for display only. */
const displayAmount = (raw: bigint, decimals: number) =>
  Number(formatTokenAmount(raw, decimals)).toLocaleString(undefined, {
    maximumFractionDigits: 4,
    minimumFractionDigits: 0,
  });

/** Why `amount` can't be unstaked right now, or null if it can. */
function amountProblem(ctx: WithdrawSolContext, amount: bigint): string | null {
  if (amount > ctx.balance) {
    return 'Exceeds staked balance';
  }
  if (amount > ctx.maxPoolTokens) {
    return `The pool's reserve can only pay out ${displayAmount(ctx.maxPoolTokens, ctx.decimals)} pool tokens right now`;
  }
  if (quoteWithdrawSol(ctx.pool, amount, ctx.feeWaived).lamports === 0n) {
    return 'Amount is too small to withdraw';
  }
  return null;
}

export function WithdrawXntDialog() {
  const [isOpen, setIsOpen] = useState(false);
  const [amount, setAmount] = useState('');
  const [selectedPool, setSelectedPool] = useState('');
  const [memo, setMemo] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const wallet = useWallet();
  const walletModal = useWalletModal();
  const {
    connection,
    programId: multisigProgramId,
    multisigAddress,
    vaultIndex,
  } = useMultisigData();
  const nativeSymbol = useNativeSymbol();
  const { data: stakePools, isLoading: poolsLoading } = useStakePools();
  const { data: multisigInfo } = useMultisig();
  const queryClient = useQueryClient();
  const isMember = useAccess();
  const { stakePoolProgramId } = useStakePoolProgramId();

  // Filter pools that have staked balance
  const stakedPools = stakePools?.filter((p) => p.userBalance && p.userBalance > 0) || [];
  const selectedPoolInfo = stakedPools.find((p) => p.address === selectedPool);

  const vaultAddress = multisigAddress
    ? multisig.getVaultPda({
        index: vaultIndex,
        multisigPda: new PublicKey(multisigAddress),
        programId: multisigProgramId ? new PublicKey(multisigProgramId) : multisig.PROGRAM_ID,
      })[0]
    : null;

  // Live pool, reserve and vault balance. The reserve moves with every holder's
  // deposits and withdrawals, so this is re-read on open and again at submit.
  const { data: withdrawContext, error: withdrawContextError } = useQuery({
    queryKey: ['stakePoolWithdrawContext', selectedPool, vaultAddress?.toBase58()],
    queryFn: () => fetchWithdrawSolContext(connection, new PublicKey(selectedPool), vaultAddress!),
    enabled: isOpen && !!selectedPool && !!vaultAddress,
    staleTime: 0,
    refetchInterval: 30000,
  });

  const rawAmount = withdrawContext ? parseTokenAmount(amount, withdrawContext.decimals) : null;
  const isAmountValid = rawAmount !== null && rawAmount > 0n;
  const problem =
    withdrawContext && isAmountValid ? amountProblem(withdrawContext, rawAmount) : null;
  const quote =
    withdrawContext && isAmountValid && !problem
      ? quoteWithdrawSol(withdrawContext.pool, rawAmount, withdrawContext.feeWaived)
      : null;
  const reserveLimited =
    !!withdrawContext && withdrawContext.maxPoolTokens < withdrawContext.balance;

  const handleWithdraw = async () => {
    if (
      !wallet.publicKey ||
      !multisigAddress ||
      !vaultAddress ||
      !selectedPoolInfo ||
      !multisigInfo
    ) {
      return;
    }

    setIsSubmitting(true);
    try {
      const stakePoolAddress = new PublicKey(selectedPoolInfo.address);

      // Re-read right before building: the reserve may have moved since the form rendered.
      const ctx = await fetchWithdrawSolContext(connection, stakePoolAddress, vaultAddress);
      const poolTokens = parseTokenAmount(amount, ctx.decimals);
      if (poolTokens === null || poolTokens <= 0n) {
        throw new Error('Enter a valid amount');
      }
      const amountError = amountProblem(ctx, poolTokens);
      if (amountError) {
        throw new Error(amountError);
      }
      if (ctx.solWithdrawAuthority && !ctx.solWithdrawAuthority.equals(vaultAddress)) {
        throw new Error(
          `This pool only allows ${nativeSymbol} withdrawals signed by ${ctx.solWithdrawAuthority.toBase58()}`
        );
      }

      const [withdrawAuthority] = PublicKey.findProgramAddressSync(
        [stakePoolAddress.toBuffer(), Buffer.from('withdraw')],
        new PublicKey(stakePoolProgramId)
      );

      // Burns the pool tokens and pays the vault from the pool's reserve, atomically.
      const withdrawInstructions = [
        createWithdrawSolInstruction({
          programId: new PublicKey(stakePoolProgramId),
          stakePool: stakePoolAddress,
          sourcePoolAccount: ctx.sourcePoolAccount,
          withdrawAuthority,
          reserveStake: ctx.reserveStake,
          destinationSystemAccount: vaultAddress, // Vault receives the native token
          sourceTransferAuthority: vaultAddress, // Vault owns the pool tokens
          solWithdrawAuthority: ctx.solWithdrawAuthority ?? undefined,
          managerFeeAccount: ctx.managerFeeAccount,
          poolMint: ctx.poolMint,
          poolTokens,
          tokenProgramId: ctx.tokenProgramId,
        }),
      ];

      const blockhash = (await connection.getLatestBlockhash()).blockhash;

      // Add memo instruction if provided
      const memoInstruction = createMemoInstruction(memo, vaultAddress);
      if (memoInstruction) {
        withdrawInstructions.push(memoInstruction);
      }

      // Simulate against live state before proposing, so an amount the reserve
      // can't cover fails here instead of after the members have approved it.
      // If the simulation can't run (RPC hiccup), warn and proceed.
      const simulation = await simulateVaultInstructions(
        connection,
        wallet.publicKey,
        withdrawInstructions
      );
      if (!simulation.ok) {
        if (simulation.simulated) {
          throw new Error(describeWithdrawSolSimulationError(simulation));
        }
        console.warn(
          'Pre-proposal simulation could not run; proceeding without it:',
          simulation.error
        );
      }

      // Create the transaction message for the vault
      const withdrawMessage = new TransactionMessage({
        instructions: withdrawInstructions,
        payerKey: vaultAddress,
        recentBlockhash: blockhash,
      });

      const transactionIndex = BigInt(Number(multisigInfo.transactionIndex) + 1);

      // Create multisig instructions
      // For multisig vault transactions, check if vault needs to sign
      let vaultNeedsToSign = false;
      withdrawInstructions.forEach((ix) => {
        ix.keys.forEach((key: any) => {
          if (key.isSigner && key.pubkey.equals(vaultAddress)) {
            vaultNeedsToSign = true;
          }
        });
      });

      const multisigTransactionIx = multisig.instructions.vaultTransactionCreate({
        multisigPda: new PublicKey(multisigAddress),
        creator: wallet.publicKey,
        ephemeralSigners: vaultNeedsToSign ? 1 : 0,
        // @ts-ignore - Type mismatch between @solana/web3.js versions
        transactionMessage: withdrawMessage,
        transactionIndex,
        addressLookupTableAccounts: [],
        rentPayer: wallet.publicKey,
        vaultIndex,
        programId: multisigProgramId ? new PublicKey(multisigProgramId) : multisig.PROGRAM_ID,
      });

      const proposalIx = multisig.instructions.proposalCreate({
        multisigPda: new PublicKey(multisigAddress),
        creator: wallet.publicKey,
        isDraft: false,
        transactionIndex,
        rentPayer: wallet.publicKey,
        programId: multisigProgramId ? new PublicKey(multisigProgramId) : multisig.PROGRAM_ID,
      });

      const approveIx = multisig.instructions.proposalApprove({
        multisigPda: new PublicKey(multisigAddress),
        member: wallet.publicKey,
        transactionIndex,
        programId: multisigProgramId ? new PublicKey(multisigProgramId) : multisig.PROGRAM_ID,
      });

      // Create and send transaction
      // Priority fee, sized compute budget, fresh blockhash, sign, then rebroadcast
      // until confirmed or expired. Throws with a message that says whether it landed.
      await signSendAndConfirmV0(
        connection,
        wallet,
        [multisigTransactionIx, proposalIx, approveIx],
        {
          label: 'WithdrawXntDialog',
          onStep: toastSteps(
            { confirming: 'Confirming unstake transaction...' },
            'unstake-transaction'
          ),
        }
      );

      toast.success(
        `Successfully proposed unstaking ${displayAmount(poolTokens, ctx.decimals)} pool tokens from ${selectedPoolInfo.name}`,
        {
          id: 'unstake-transaction',
        }
      );

      // Reset form and close dialog
      setAmount('');
      setSelectedPool('');
      setMemo('');
      setIsOpen(false);

      // Invalidate queries to refresh data
      await queryClient.invalidateQueries({ queryKey: ['transactions'] });
      await queryClient.invalidateQueries({ queryKey: ['stakePools'] });
      await queryClient.invalidateQueries({ queryKey: ['stakePoolWithdrawContext'] });
    } catch (error) {
      console.error('Error creating unstake transaction:', error);
      toast.error(
        `Failed to unstake: ${error instanceof Error ? error.message : 'Unknown error'}`,
        {
          id: 'unstake-transaction',
        }
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          disabled={!isMember || stakedPools.length === 0}
          onClick={(e) => {
            if (!wallet.publicKey) {
              e.preventDefault();
              walletModal.setVisible(true);
              return;
            }
            setIsOpen(true);
          }}
        >
          Unstake
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Unstake from Stake Pool</DialogTitle>
          <DialogDescription>
            Withdraw your staked {nativeSymbol} from a pool. Select a pool and enter the amount of
            pool tokens to burn.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-4">
          <div className="space-y-2">
            <Label htmlFor="pool">Select Staked Pool</Label>
            <Select value={selectedPool} onValueChange={setSelectedPool}>
              <SelectTrigger id="pool">
                <SelectValue placeholder="Choose a pool to unstake from" />
              </SelectTrigger>
              <SelectContent>
                {poolsLoading ? (
                  <SelectItem value="loading" disabled>
                    Loading pools...
                  </SelectItem>
                ) : stakedPools.length > 0 ? (
                  stakedPools.map((pool) => (
                    <SelectItem key={pool.address} value={pool.address}>
                      <div className="flex flex-col">
                        <span>{pool.name}</span>
                        <span className="text-sm text-muted-foreground">
                          Staked:{' '}
                          {pool.userBalance?.toLocaleString(undefined, {
                            maximumFractionDigits: 4,
                            minimumFractionDigits: 0,
                          })}{' '}
                          tokens
                        </span>
                      </div>
                    </SelectItem>
                  ))
                ) : (
                  <SelectItem value="none" disabled>
                    No staked positions
                  </SelectItem>
                )}
              </SelectContent>
            </Select>
          </div>

          {selectedPoolInfo && (
            <div className="space-y-2">
              <Label>Staked Balance</Label>
              <div className="text-2xl font-bold">
                {withdrawContext
                  ? displayAmount(withdrawContext.balance, withdrawContext.decimals)
                  : selectedPoolInfo.userBalance?.toLocaleString(undefined, {
                      maximumFractionDigits: 4,
                      minimumFractionDigits: 0,
                    })}{' '}
                Pool Tokens
              </div>
              {reserveLimited && (
                <p className="text-sm text-muted-foreground">
                  Available to unstake now:{' '}
                  {displayAmount(withdrawContext.maxPoolTokens, withdrawContext.decimals)} (limited
                  by the pool's reserve)
                </p>
              )}
              {withdrawContextError && (
                <p className="text-sm text-destructive">
                  Could not load pool state: {(withdrawContextError as Error).message}
                </p>
              )}
            </div>
          )}

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="amount">Pool Tokens to Burn</Label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-xs"
                onClick={() =>
                  withdrawContext &&
                  setAmount(
                    formatTokenAmount(withdrawContext.maxPoolTokens, withdrawContext.decimals)
                  )
                }
                disabled={!withdrawContext || withdrawContext.maxPoolTokens === 0n}
              >
                Max
              </Button>
            </div>
            <Input
              id="amount"
              type="number"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              step="any"
            />
            {withdrawContext && amount && !isAmountValid && (
              <p className="text-sm text-destructive">Please enter a valid amount</p>
            )}
            {problem && <p className="text-sm text-destructive">{problem}</p>}
            {quote && (
              <p className="text-sm text-muted-foreground">
                You receive ≈ {displayAmount(quote.lamports, LAMPORT_DECIMALS)} {nativeSymbol}
                {quote.feePoolTokens > 0n &&
                  ` after a ${displayAmount(quote.feePoolTokens, withdrawContext!.decimals)} pool token withdrawal fee`}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="memo">Memo (optional)</Label>
            <Textarea
              id="memo"
              placeholder="Add a note about this unstake transaction..."
              value={memo}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setMemo(e.target.value)}
              className="resize-none"
              rows={2}
            />
          </div>

          <div className="rounded-lg bg-orange-50 p-3 dark:bg-orange-950">
            <p className="text-sm text-orange-800 dark:text-orange-200">
              {nativeSymbol} is paid from the pool's reserve when the proposal executes, in the same
              step that burns the pool tokens. If other withdrawals drain the reserve before then,
              execution fails and nothing is burned.
            </p>
          </div>

          <Button
            className="w-full"
            onClick={handleWithdraw}
            disabled={!withdrawContext || !isAmountValid || !!problem || isSubmitting}
          >
            {isSubmitting ? 'Creating Proposal...' : 'Propose Unstake Transaction'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
