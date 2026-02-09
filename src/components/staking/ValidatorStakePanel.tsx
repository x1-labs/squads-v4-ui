import { useState, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { DelegateStakeDialog } from './DelegateStakeDialog';
import { useStakeAccounts } from '@/hooks/useStakeAccounts';
import { useValidatorsMetadata } from '@/hooks/useValidatorMetadata';
import { useMultisigData } from '@/hooks/useMultisigData';
import { Skeleton } from '../ui/skeleton';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Checkbox } from '../ui/checkbox';
import { Layers, ArrowDown, Wallet } from 'lucide-react';
import { StakeAccountActions } from './StakeAccountActions';
import { useBatchTransactions } from '@/hooks/useBatchTransactions';
import { StakeAccountInfo, createDeactivateStakeInstruction, createWithdrawStakeInstruction } from '@/lib/staking/validatorStakeUtils';
import { PublicKey } from '@solana/web3.js';
import * as multisig from '@sqds/multisig';
import { toast } from 'sonner';

export function ValidatorStakePanel() {
  const { vaultIndex, multisigAddress, programId } = useMultisigData();
  const { data: stakeAccounts, isLoading } = useStakeAccounts(vaultIndex);
  const [batchMode, setBatchMode] = useState(false);
  const [selectedAccounts, setSelectedAccounts] = useState<Set<string>>(new Set());
  const { addItem } = useBatchTransactions();

  // Get unique validator addresses
  const validatorAddresses =
    stakeAccounts?.map((account) => account.delegatedValidator).filter((v): v is string => !!v) ||
    [];

  const { data: validatorMetadata } = useValidatorsMetadata(validatorAddresses);

  // Calculate totals
  const totals = stakeAccounts?.reduce(
    (acc, account) => {
      acc.totalBalance += account.balance;
      acc.totalActive += account.activeStake || 0;
      acc.totalInactive += account.inactiveStake || 0;
      return acc;
    },
    { totalBalance: 0, totalActive: 0, totalInactive: 0 }
  ) || { totalBalance: 0, totalActive: 0, totalInactive: 0 };

  const sortedAccounts = useMemo(() => {
    if (!stakeAccounts) return [];
    return [...stakeAccounts].sort((a, b) => {
      if (b.balance !== a.balance) return b.balance - a.balance;
      const aValidator = a.delegatedValidator || '';
      const bValidator = b.delegatedValidator || '';
      return aValidator.localeCompare(bValidator);
    });
  }, [stakeAccounts]);

  const getStatusBadgeVariant = (
    state: string
  ): 'default' | 'secondary' | 'outline' | 'destructive' => {
    switch (state) {
      case 'active':
        return 'default';
      case 'activating':
        return 'secondary';
      case 'deactivating':
        return 'outline';
      case 'inactive':
        return 'secondary';
      default:
        return 'outline';
    }
  };

  const toggleBatchMode = () => {
    if (batchMode) {
      setSelectedAccounts(new Set());
    }
    setBatchMode(!batchMode);
  };

  const toggleAccount = (address: string) => {
    setSelectedAccounts((prev) => {
      const next = new Set(prev);
      if (next.has(address)) {
        next.delete(address);
      } else {
        next.add(address);
      }
      return next;
    });
  };

  const selectAll = () => {
    if (!stakeAccounts) return;
    setSelectedAccounts(new Set(stakeAccounts.map((a) => a.address)));
  };

  const selectNone = () => {
    setSelectedAccounts(new Set());
  };

  const getValidatorLabel = (account: StakeAccountInfo) => {
    if (account.delegatedValidator && validatorMetadata?.get(account.delegatedValidator)?.name) {
      return validatorMetadata.get(account.delegatedValidator)!.name!;
    }
    if (account.delegatedValidator) {
      return `${account.delegatedValidator.slice(0, 8)}...`;
    }
    return `${account.address.slice(0, 8)}...`;
  };

  const getVaultAddress = () => {
    if (!multisigAddress) return null;
    return multisig.getVaultPda({
      index: vaultIndex,
      multisigPda: new PublicKey(multisigAddress),
      programId,
    })[0];
  };

  const batchUnstake = () => {
    const vaultAddress = getVaultAddress();
    if (!vaultAddress) return;

    const selected = sortedAccounts.filter((a) => selectedAccounts.has(a.address));
    const eligible = selected.filter(
      (a) => a.state === 'active' || a.state === 'activating'
    );

    if (eligible.length === 0) {
      toast.error('No selected accounts are eligible for unstaking (must be active or activating)');
      return;
    }

    for (const account of eligible) {
      const instruction = createDeactivateStakeInstruction(
        new PublicKey(account.address),
        vaultAddress
      );
      addItem({
        type: 'unstake',
        label: `Unstake ${getValidatorLabel(account)}`,
        description: `${account.balance.toLocaleString(undefined, { maximumFractionDigits: 2 })} XNT - ${account.address.slice(0, 8)}...`,
        instructions: [instruction],
        vaultIndex,
      });
    }

    toast.success(`Added ${eligible.length} unstake operation${eligible.length > 1 ? 's' : ''} to batch queue`);
    setSelectedAccounts(new Set());
    setBatchMode(false);
  };

  const batchWithdraw = () => {
    const vaultAddress = getVaultAddress();
    if (!vaultAddress) return;

    const selected = sortedAccounts.filter((a) => selectedAccounts.has(a.address));
    const eligible = selected.filter(
      (a) => a.state === 'inactive' || a.state === 'deactivating'
    );

    if (eligible.length === 0) {
      toast.error('No selected accounts are eligible for withdrawal (must be inactive or deactivating)');
      return;
    }

    for (const account of eligible) {
      const lamports = account.balanceLamports;
      const instruction = createWithdrawStakeInstruction(
        new PublicKey(account.address),
        vaultAddress,
        BigInt(lamports)
      );
      addItem({
        type: 'withdraw',
        label: `Withdraw ${getValidatorLabel(account)}`,
        description: `${account.balance.toLocaleString(undefined, { maximumFractionDigits: 2 })} XNT - ${account.address.slice(0, 8)}...`,
        instructions: [instruction],
        vaultIndex,
      });
    }

    toast.success(`Added ${eligible.length} withdraw operation${eligible.length > 1 ? 's' : ''} to batch queue`);
    setSelectedAccounts(new Set());
    setBatchMode(false);
  };

  // Count eligible accounts for each batch action among selected
  const selectedList = sortedAccounts.filter((a) => selectedAccounts.has(a.address));
  const unstakeEligibleCount = selectedList.filter(
    (a) => a.state === 'active' || a.state === 'activating'
  ).length;
  const withdrawEligibleCount = selectedList.filter(
    (a) => a.state === 'inactive' || a.state === 'deactivating'
  ).length;

  return (
    <Card>
      <CardHeader>
        <div className="space-y-4">
          <div className="flex flex-col space-y-4 sm:flex-row sm:items-start sm:justify-between sm:space-y-0">
            <div className="space-y-1">
              <CardTitle>Validator Staking</CardTitle>
              <CardDescription>Stake XNT directly to validators</CardDescription>
            </div>
            <div className="grid w-full grid-cols-1 gap-2 sm:flex sm:w-auto sm:gap-2">
              {stakeAccounts && stakeAccounts.length > 1 && (
                <Button
                  variant={batchMode ? 'secondary' : 'outline'}
                  onClick={toggleBatchMode}
                  size="sm"
                >
                  <Layers className="mr-1.5 h-4 w-4" />
                  {batchMode ? 'Cancel' : 'Batch'}
                </Button>
              )}
              <DelegateStakeDialog vaultIndex={vaultIndex} />
            </div>
          </div>
          {/* Summary Stats */}
          {totals.totalBalance > 0 && (
            <div className="grid grid-cols-1 gap-3 rounded-lg bg-muted/50 p-4 sm:grid-cols-3 sm:gap-4">
              <div className="text-center">
                <p className="text-xs text-muted-foreground">Total Balance</p>
                <p className="text-sm font-medium sm:text-base">
                  {totals.totalBalance.toLocaleString(undefined, {
                    maximumFractionDigits: 2,
                  })}{' '}
                  XNT
                </p>
              </div>
              <div className="text-center">
                <p className="text-xs text-muted-foreground">Active</p>
                <p className="text-sm font-medium text-emerald-600 sm:text-base">
                  {totals.totalActive.toLocaleString(undefined, {
                    maximumFractionDigits: 2,
                  })}{' '}
                  XNT
                </p>
              </div>
              <div className="text-center">
                <p className="text-xs text-muted-foreground">Inactive</p>
                <p className="text-sm font-medium text-gray-600 sm:text-base">
                  {totals.totalInactive.toLocaleString(undefined, {
                    maximumFractionDigits: 2,
                  })}{' '}
                  XNT
                </p>
              </div>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {/* Batch selection controls */}
          {batchMode && stakeAccounts && stakeAccounts.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 p-3">
              <span className="text-sm font-medium">
                {selectedAccounts.size} selected
              </span>
              <div className="flex gap-1">
                <Button variant="ghost" size="sm" onClick={selectAll} className="h-7 text-xs">
                  All
                </Button>
                <Button variant="ghost" size="sm" onClick={selectNone} className="h-7 text-xs">
                  None
                </Button>
              </div>
              <div className="ml-auto flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={batchUnstake}
                  disabled={unstakeEligibleCount === 0}
                  className="h-8"
                >
                  <ArrowDown className="mr-1.5 h-3.5 w-3.5" />
                  Batch Unstake{unstakeEligibleCount > 0 ? ` (${unstakeEligibleCount})` : ''}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={batchWithdraw}
                  disabled={withdrawEligibleCount === 0}
                  className="h-8"
                >
                  <Wallet className="mr-1.5 h-3.5 w-3.5" />
                  Batch Withdraw{withdrawEligibleCount > 0 ? ` (${withdrawEligibleCount})` : ''}
                </Button>
              </div>
            </div>
          )}

          {isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          ) : stakeAccounts && stakeAccounts.length > 0 ? (
            <div className="space-y-2">
              <h3 className="mb-3 text-sm font-medium text-muted-foreground">Stake Accounts</h3>
              {sortedAccounts.map((account) => (
                  <div
                    key={account.address}
                    className={`space-y-3 rounded-lg p-3 transition-colors ${
                      batchMode && selectedAccounts.has(account.address)
                        ? 'bg-primary/10 ring-1 ring-primary/30'
                        : account.state === 'inactive'
                          ? 'bg-muted/20 opacity-75 hover:bg-muted/30'
                          : 'bg-muted/30 hover:bg-muted/50'
                    } ${batchMode ? 'cursor-pointer' : ''}`}
                    onClick={batchMode ? () => toggleAccount(account.address) : undefined}
                  >
                    {/* Header with stake account info and action button */}
                    <div className="flex items-start justify-between gap-2 sm:items-center">
                      <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-center">
                        {batchMode && (
                          <Checkbox
                            checked={selectedAccounts.has(account.address)}
                            onCheckedChange={() => toggleAccount(account.address)}
                            onClick={(e) => e.stopPropagation()}
                            className="mt-0.5 sm:mt-0"
                          />
                        )}
                        <p className="break-all font-mono text-xs sm:break-normal">
                          {account.address.slice(0, 6)}...{account.address.slice(-6)}
                        </p>
                        <Badge
                          variant={getStatusBadgeVariant(account.state)}
                          className={`w-fit px-2 py-0 text-xs`}
                        >
                          {account.state}
                        </Badge>
                      </div>
                      {!batchMode && (
                        <div className="flex-shrink-0">
                          <StakeAccountActions
                            account={account}
                            vaultIndex={vaultIndex}
                            allStakeAccounts={stakeAccounts || []}
                          />
                        </div>
                      )}
                    </div>

                    {/* Content section */}
                    <div className="space-y-3">
                      <div className="flex flex-col space-y-2 sm:flex-row sm:items-center sm:justify-between sm:space-y-0">
                        <div className="flex items-start gap-3 sm:items-center">
                          <div className="min-w-0 flex-1 space-y-1">
                            {account.delegatedValidator ? (
                              <div className="space-y-1">
                                <div className="flex items-center gap-1.5">
                                  {validatorMetadata?.get(account.delegatedValidator)
                                    ?.avatarUrl && (
                                    <img
                                      src={
                                        validatorMetadata.get(account.delegatedValidator)!.avatarUrl
                                      }
                                      alt={
                                        validatorMetadata.get(account.delegatedValidator)?.name ||
                                        'Validator'
                                      }
                                      className="h-4 w-4 rounded-full"
                                      onError={(e) => {
                                        (e.target as HTMLImageElement).style.display = 'none';
                                      }}
                                    />
                                  )}
                                  <p className="text-xs font-medium text-muted-foreground">
                                    {validatorMetadata?.get(account.delegatedValidator)?.name ||
                                      `Validator ${account.delegatedValidator.slice(0, 8)}...`}
                                  </p>
                                </div>
                                <div className="space-y-0.5 pl-5">
                                  <p className="break-all text-xs text-muted-foreground/70">
                                    <span className="hidden lg:inline">
                                      Vote: {account.delegatedValidator}
                                    </span>
                                    <span className="lg:hidden">
                                      Vote: {account.delegatedValidator.slice(0, 6)}...
                                      {account.delegatedValidator.slice(-4)}
                                    </span>
                                  </p>
                                  {validatorMetadata?.get(account.delegatedValidator)?.identity && (
                                    <p className="break-all text-xs text-muted-foreground/70">
                                      <span className="hidden lg:inline">
                                        Identity:{' '}
                                        {
                                          validatorMetadata.get(account.delegatedValidator)!
                                            .identity
                                        }
                                      </span>
                                      <span className="lg:hidden">
                                        Identity:{' '}
                                        {validatorMetadata
                                          .get(account.delegatedValidator)!
                                          .identity!.slice(0, 6)}
                                        ...
                                        {validatorMetadata
                                          .get(account.delegatedValidator)!
                                          .identity!.slice(-4)}
                                      </span>
                                    </p>
                                  )}
                                </div>
                              </div>
                            ) : account.state === 'inactive' ? (
                              <p className="text-xs text-muted-foreground">
                                Stake account is undelegated (can be re-delegated)
                              </p>
                            ) : null}
                          </div>
                        </div>
                        <div className="text-left sm:text-right">
                          <div className="space-y-1">
                            <p className="text-sm font-medium sm:text-base">
                              {(account.state === 'inactive'
                                ? account.balance
                                : account.delegated
                              ).toLocaleString(undefined, {
                                maximumFractionDigits: 2,
                              })}{' '}
                              XNT
                            </p>
                            <div className="grid gap-1 text-xs text-muted-foreground sm:gap-0.5">
                              {account.activeStake !== undefined &&
                                account.activeStake !== account.balance && (
                                  <div className="flex items-center justify-between gap-2 sm:grid sm:grid-cols-[auto_1fr] sm:justify-start sm:gap-1">
                                    <div className="flex items-center gap-1">
                                      <div className="h-2 w-2 rounded-full bg-emerald-200 dark:bg-emerald-300/30" />
                                      <span>Active:</span>
                                    </div>
                                    <span className="tabular-nums">
                                      {account.activeStake.toLocaleString(undefined, {
                                        maximumFractionDigits: 2,
                                      })}{' '}
                                      XNT
                                    </span>
                                  </div>
                                )}
                              {account.inactiveStake !== undefined &&
                                account.inactiveStake !== account.balance && (
                                  <div className="flex items-center justify-between gap-2 sm:grid sm:grid-cols-[auto_1fr] sm:justify-start sm:gap-1">
                                    <div className="flex items-center gap-1">
                                      <div className="h-2 w-2 rounded-full bg-gray-300 dark:bg-gray-500/40" />
                                      <span>Inactive:</span>
                                    </div>
                                    <span className="tabular-nums">
                                      {account.inactiveStake.toLocaleString(undefined, {
                                        maximumFractionDigits: 2,
                                      })}{' '}
                                      XNT
                                    </span>
                                  </div>
                                )}
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Full-width progress bar at bottom */}
                      {(account.activeStake !== undefined || account.inactiveStake !== undefined) &&
                        (account.activeStake !== account.balance ||
                          account.inactiveStake !== account.balance) &&
                        (() => {
                          const activeStake = account.activeStake || 0;
                          const inactiveStake = account.inactiveStake || 0;
                          const totalStake = activeStake + inactiveStake;

                          // Use the sum of active + inactive as the denominator for accurate percentages
                          const activePercentage =
                            totalStake > 0 ? (activeStake / totalStake) * 100 : 0;
                          const inactivePercentage =
                            totalStake > 0 ? (inactiveStake / totalStake) * 100 : 0;

                          return (
                            <div className="flex h-2 w-full overflow-hidden rounded-full bg-muted">
                              {account.activeStake !== undefined && activeStake > 0 && (
                                <div
                                  className="bg-emerald-200 transition-all dark:bg-emerald-300/30"
                                  style={{
                                    width: `${activePercentage}%`,
                                  }}
                                />
                              )}
                              {account.inactiveStake !== undefined && inactiveStake > 0 && (
                                <div
                                  className="bg-gray-300 transition-all dark:bg-gray-500/40"
                                  style={{
                                    width: `${inactivePercentage}%`,
                                  }}
                                />
                              )}
                            </div>
                          );
                        })()}
                    </div>
                  </div>
                ))}
            </div>
          ) : (
            <div className="py-8 text-center">
              <p className="text-sm text-muted-foreground">No stake accounts found</p>
              <p className="mt-2 text-xs text-muted-foreground">
                Create a stake account by delegating XNT to a validator
              </p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
