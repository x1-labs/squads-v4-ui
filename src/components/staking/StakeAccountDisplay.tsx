import { Badge } from '@/components/ui/badge';
import { StakeAccountInfo } from '@/lib/staking/validatorStakeUtils';
import { useValidatorsMetadata } from '@/hooks/useValidatorMetadata';

type StakeAccountDisplayProps = {
  account: StakeAccountInfo;
  showBalance?: boolean;
};

export function StakeAccountDisplay({ account, showBalance = true }: StakeAccountDisplayProps) {
  const { data: validatorMetadata } = useValidatorsMetadata(
    account.delegatedValidator ? [account.delegatedValidator] : []
  );

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
        return 'bg-gray-500';
    }
  };

  const getBadgeVariant = (state: string): 'default' | 'secondary' | 'outline' | 'destructive' => {
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
    <div className="rounded-lg border bg-muted/50 p-3">
      <div className="space-y-2">
        {/* Account header */}
        <div className="flex items-center justify-between">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <div
              className={`h-2 w-2 flex-shrink-0 rounded-full ${getStatusColor(account.state)}`}
            />
            <span className="truncate font-mono text-xs font-medium">
              {account.address.slice(0, 8)}...{account.address.slice(-8)}
            </span>
            <Badge
              variant={getBadgeVariant(account.state)}
              className="flex-shrink-0 px-2 py-0 text-xs"
            >
              {account.state}
            </Badge>
          </div>
          {showBalance && (
            <div className="flex-shrink-0 text-xs font-semibold">
              {account.balance.toLocaleString(undefined, { maximumFractionDigits: 2 })} XNT
            </div>
          )}
        </div>

        {/* Validator info */}
        {account.delegatedValidator && (
          <div className="flex min-w-0 items-center gap-2">
            {validatorMetadata?.get(account.delegatedValidator)?.avatarUrl && (
              <img
                src={validatorMetadata.get(account.delegatedValidator)!.avatarUrl}
                alt={validatorMetadata.get(account.delegatedValidator)?.name || 'Validator'}
                className="h-4 w-4 flex-shrink-0 rounded-full"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = 'none';
                }}
              />
            )}
            <div className="min-w-0 flex-1 overflow-hidden">
              <div className="truncate text-xs font-medium">
                {validatorMetadata?.get(account.delegatedValidator)?.name || 'Unknown Validator'}
              </div>
              <div className="truncate font-mono text-xs text-muted-foreground">
                Vote: {account.delegatedValidator.slice(0, 12)}...
                {account.delegatedValidator.slice(-12)}
              </div>
              {validatorMetadata?.get(account.delegatedValidator)?.identity && (
                <div className="truncate font-mono text-xs text-muted-foreground">
                  Identity:{' '}
                  {validatorMetadata.get(account.delegatedValidator)?.identity?.slice(0, 12)}...
                  {validatorMetadata.get(account.delegatedValidator)?.identity?.slice(-12)}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
