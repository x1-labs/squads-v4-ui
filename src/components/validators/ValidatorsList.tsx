import { useState } from 'react';
import { ValidatorInfo } from '@/lib/validators/validatorUtils';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { ChangeCommissionDialog } from './ChangeCommissionDialog';
import { WithdrawRewardsDialog } from './WithdrawRewardsDialog';
import { ChangeAuthorityDialog } from './ChangeAuthorityDialog';
import { ChevronRight, Wallet, Percent, Key } from 'lucide-react';
import { ValidatorDetails } from './ValidatorDetails';
import { useValidatorsMetadata } from '@/hooks/useValidatorMetadata';

interface ValidatorsListProps {
  validators: ValidatorInfo[];
}

export function ValidatorsList({ validators }: ValidatorsListProps) {
  const [selectedValidator, setSelectedValidator] = useState<ValidatorInfo | null>(null);
  const [showDetails, setShowDetails] = useState<string | null>(null);
  
  const validatorAddresses = validators.map(v => v.nodePubkey.toBase58());
  const { data: validatorMetadata } = useValidatorsMetadata(validatorAddresses);

  const handleViewDetails = (validator: ValidatorInfo) => {
    setSelectedValidator(validator);
    setShowDetails(validator.votePubkey.toBase58());
  };

  return (
    <div className="space-y-3">
      {validators.map((validator) => {
        const metadata = validatorMetadata?.get(validator.nodePubkey.toBase58());
        const isExpanded = showDetails === validator.votePubkey.toBase58();

        return (
          <div key={validator.votePubkey.toBase58()} className="space-y-2">
            <div className="rounded-lg border bg-card p-4 transition-colors hover:bg-muted/30">
              <div className="flex items-start justify-between">
                <div className="flex-1 space-y-2">
                  <div className="flex items-start gap-3">
                    {metadata?.avatarUrl && (
                      <img
                        src={metadata.avatarUrl}
                        alt={metadata.name || 'Validator'}
                        className="h-10 w-10 rounded-full"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = 'none';
                        }}
                      />
                    )}
                    <div className="flex-1">
                      <h3 className="font-semibold">
                        {metadata?.name || `Validator ${validator.votePubkey.toBase58().slice(0, 8)}...`}
                      </h3>
                      <div className="mt-1 space-y-1">
                        <p className="text-xs text-muted-foreground">
                          Vote: {validator.votePubkey.toBase58().slice(0, 8)}...{validator.votePubkey.toBase58().slice(-8)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Identity: {validator.nodePubkey.toBase58().slice(0, 8)}...{validator.nodePubkey.toBase58().slice(-8)}
                        </p>
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex flex-wrap gap-4 text-sm">
                    <div>
                      <span className="text-muted-foreground">Commission:</span>{' '}
                      <span className="font-medium">{validator.commission}%</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Balance:</span>{' '}
                      <span className="font-medium">{validator.balance.toFixed(4)} SOL</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Rewards:</span>{' '}
                      <span className="font-medium text-green-600 dark:text-green-400">
                        {validator.rewards.toFixed(4)} SOL
                      </span>
                    </div>
                  </div>
                </div>

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleViewDetails(validator)}
                  className="ml-2"
                >
                  <ChevronRight className={`h-4 w-4 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                </Button>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <WithdrawRewardsDialog validator={validator} />
                <ChangeCommissionDialog validator={validator} />
                <ChangeAuthorityDialog validator={validator} />
              </div>
            </div>

            {isExpanded && selectedValidator && (
              <ValidatorDetails
                validator={selectedValidator}
                onClose={() => setShowDetails(null)}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}