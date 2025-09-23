import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { DelegateStakeDialog } from './DelegateStakeDialog';
import { UndelegateStakeDialog } from './UndelegateStakeDialog';
import { WithdrawStakeDialog } from './WithdrawStakeDialog';
import { RedelegateStakeDialog } from './RedelegateStakeDialog';
import { useStakeAccounts } from '@/hooks/useStakeAccounts';
import { useValidatorsMetadata } from '@/hooks/useValidatorMetadata';
import { useMultisigData } from '@/hooks/useMultisigData';
import { Skeleton } from '../ui/skeleton';
import { Badge } from '../ui/badge';

export function ValidatorStakePanel() {
  const { vaultIndex } = useMultisigData();
  const { data: stakeAccounts, isLoading } = useStakeAccounts(vaultIndex);

  // Get unique validator addresses
  const validatorAddresses =
    stakeAccounts?.map((account) => account.delegatedValidator).filter((v): v is string => !!v) ||
    [];

  const { data: validatorMetadata } = useValidatorsMetadata(validatorAddresses);

  const totalStaked =
    stakeAccounts?.reduce((acc, account) => {
      if (account.state === 'active' || account.state === 'activating') {
        return acc + (account.activeStake || account.balance);
      }
      return acc;
    }, 0) || 0;

  const getStatusColor = (state: string) => {
    switch (state) {
      case 'active':
        return 'bg-green-500';
      case 'activating':
        return 'bg-yellow-500';
      case 'deactivating':
        return 'bg-orange-500';
      case 'inactive':
        return 'bg-gray-500';
      default:
        return 'bg-gray-400';
    }
  };

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

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col space-y-4 sm:flex-row sm:items-start sm:justify-between sm:space-y-0">
          <div className="space-y-1">
            <CardTitle>Validator Staking</CardTitle>
            <CardDescription>
              Stake XNT directly to validators
              {totalStaked > 0 && (
                <span className="block font-medium sm:ml-2 sm:inline">
                  Total:{' '}
                  {totalStaked.toLocaleString(undefined, {
                    maximumFractionDigits: 2,
                    minimumFractionDigits: 2,
                  })}{' '}
                  XNT
                </span>
              )}
            </CardDescription>
          </div>
          <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto">
            <DelegateStakeDialog vaultIndex={vaultIndex} />
            {stakeAccounts && stakeAccounts.length > 0 && (
              <>
                <RedelegateStakeDialog stakeAccounts={stakeAccounts} vaultIndex={vaultIndex} />
                <UndelegateStakeDialog stakeAccounts={stakeAccounts} vaultIndex={vaultIndex} />
                <WithdrawStakeDialog stakeAccounts={stakeAccounts} vaultIndex={vaultIndex} />
              </>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          ) : stakeAccounts && stakeAccounts.length > 0 ? (
            <div className="space-y-2">
              <h3 className="mb-3 text-sm font-medium text-muted-foreground">Stake Accounts</h3>
              {stakeAccounts.map((account) => (
                <div
                  key={account.address}
                  className="flex flex-col space-y-2 rounded-lg bg-muted/30 p-3 transition-colors hover:bg-muted/50 sm:flex-row sm:items-center sm:justify-between sm:space-y-0"
                >
                  <div className="flex items-start gap-3 sm:items-center">
                    <div
                      className={`mt-1.5 h-2 w-2 flex-shrink-0 rounded-full sm:mt-0 ${getStatusColor(account.state)}`}
                    />
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="break-all font-mono text-xs sm:break-normal">
                          {account.address.slice(0, 8)}...{account.address.slice(-8)}
                        </p>
                        <Badge
                          variant={getStatusBadgeVariant(account.state)}
                          className="px-2 py-0 text-xs"
                        >
                          {account.state}
                        </Badge>
                      </div>
                      {account.delegatedValidator ? (
                        <div className="space-y-1">
                          <div className="flex items-center gap-1.5">
                            {validatorMetadata?.get(account.delegatedValidator)?.avatarUrl && (
                              <img
                                src={validatorMetadata.get(account.delegatedValidator)!.avatarUrl}
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
                                  {validatorMetadata.get(account.delegatedValidator)!.identity}
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
                  <div className="pl-5 text-left sm:pl-0 sm:text-right">
                    <p className="font-medium">
                      {account.balance.toLocaleString(undefined, {
                        maximumFractionDigits: 4,
                        minimumFractionDigits: 2,
                      })}{' '}
                      XNT
                    </p>
                    {account.activeStake !== undefined &&
                      account.activeStake !== account.balance && (
                        <p className="text-xs text-muted-foreground">
                          Active: {account.activeStake.toFixed(2)} XNT
                        </p>
                      )}
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
