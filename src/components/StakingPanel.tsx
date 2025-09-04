import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { DepositXntDialog } from './DepositXntDialog';
import { WithdrawXntDialog } from './WithdrawXntDialog';
import { useStakePools, useTotalStaked } from '../hooks/useStakePools';
import { useBalance } from '../hooks/useServices';
import { LAMPORTS_PER_SOL } from '@solana/web3.js';
import { Skeleton } from './ui/skeleton';

export function StakingPanel() {
  const { data: stakePools, isLoading: poolsLoading } = useStakePools();
  const totalStaked = useTotalStaked();
  const { data: solBalance } = useBalance();

  const availableBalance = solBalance ? solBalance / LAMPORTS_PER_SOL : 0;

  // Calculate total value (available + staked)
  const totalValue = availableBalance + totalStaked;

  // Group pools by staked/available
  const stakedPools = stakePools?.filter((p) => p.userBalance && p.userBalance > 0) || [];
  const availablePools = stakePools?.filter((p) => !p.userBalance || p.userBalance === 0) || [];

  return (
    <Card className="col-span-1 xl:col-span-2">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Staking</CardTitle>
            <CardDescription>Stake XNT to earn rewards</CardDescription>
          </div>
          <div className="flex gap-2">
            <DepositXntDialog />
            <WithdrawXntDialog />
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          {/* Overview Stats */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Available XNT</p>
              <p className="text-2xl font-bold">{availableBalance.toFixed(4)}</p>
            </div>
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Total Staked</p>
              <p className="text-2xl font-bold">{totalStaked.toFixed(4)}</p>
            </div>
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Total Value</p>
              <p className="text-2xl font-bold">{totalValue.toFixed(4)}</p>
            </div>
          </div>

          {/* Staked Positions */}
          {stakedPools.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-medium text-muted-foreground">Your Staked Positions</h3>
              <div className="space-y-2">
                {stakedPools.map((pool) => (
                  <div
                    key={pool.address}
                    className="flex items-center justify-between rounded-lg bg-muted/30 p-3 transition-colors hover:bg-muted/50"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-green-500 to-emerald-500">
                        <span className="text-xs font-bold text-white">SP</span>
                      </div>
                      <div>
                        <p className="font-medium">{pool.name}</p>
                        <p className="text-sm text-muted-foreground">APY: {pool.apy}%</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-medium">{pool.userBalance?.toFixed(4)}</p>
                      <p className="text-sm text-muted-foreground">Pool Tokens</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Available Pools */}
          <div className="space-y-3">
            <h3 className="text-sm font-medium text-muted-foreground">Available Stake Pools</h3>
            {poolsLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
              </div>
            ) : availablePools.length > 0 ? (
              <div className="space-y-2">
                {availablePools.map((pool) => (
                  <div
                    key={pool.address}
                    className="flex items-center justify-between rounded-lg bg-muted/30 p-3 transition-colors hover:bg-muted/50"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-purple-500">
                        <span className="text-xs font-bold text-white">SP</span>
                      </div>
                      <div>
                        <p className="font-medium">{pool.name}</p>
                        <p className="text-sm text-muted-foreground">APY: {pool.apy}%</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-muted-foreground">Not staked</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-lg bg-muted/30 p-4 text-center">
                <p className="text-sm text-muted-foreground">No stake pools available</p>
              </div>
            )}
          </div>

          {/* Info Message */}
          <div className="rounded-lg bg-blue-50 p-3 dark:bg-blue-950">
            <p className="text-sm text-blue-800 dark:text-blue-200">
              Staking requires multisig approval. Create a proposal to stake or unstake your XNT.
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
