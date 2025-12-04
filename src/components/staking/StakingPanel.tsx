import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { DepositXntDialog } from './DepositXntDialog';
import { WithdrawXntDialog } from './WithdrawXntDialog';
import { useStakePools } from '@/hooks/useStakePools';
import { Skeleton } from '../ui/skeleton';

export function StakingPanel() {
  const { data: stakePools, isLoading: poolsLoading } = useStakePools();

  // Group pools by staked/available
  const stakedPools = stakePools?.filter((p) => p.userBalance && p.userBalance > 0) || [];

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Stake Pools</CardTitle>
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
                      {pool.logoURI ? (
                        <img
                          src={pool.logoURI}
                          alt={pool.name}
                          className="h-10 w-10 rounded-full object-cover"
                          onError={(e) => {
                            e.currentTarget.style.display = 'none';
                            e.currentTarget.nextElementSibling?.classList.remove('hidden');
                          }}
                        />
                      ) : null}
                      <div
                        className={`flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-green-500 to-emerald-500 ${pool.logoURI ? 'hidden' : ''}`}
                      >
                        <span className="text-xs font-bold text-white">
                          {pool.tokenSymbol?.slice(0, 2) || 'SP'}
                        </span>
                      </div>
                      <div>
                        <p className="font-medium">{pool.name}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-medium">
                        {pool.userBalance?.toLocaleString(undefined, {
                          maximumFractionDigits: 4,
                          minimumFractionDigits: 0,
                        })}
                      </p>
                      {pool.tokenSymbol && (
                        <p className="text-sm text-muted-foreground">{pool.tokenSymbol}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
