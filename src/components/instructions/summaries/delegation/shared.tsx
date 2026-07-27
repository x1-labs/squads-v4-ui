import React from 'react';
import { AddressWithButtons } from '@/components/AddressWithButtons';
import { useValidatorMetadata } from '@/hooks/useValidatorMetadata';

export * from '../shared';

/**
 * Identifies the validator an instruction acts on: gossip name when the Config
 * program has one, plus the vote account and the program's record for it.
 */
export const ValidatorTarget: React.FC<{ voteAccount?: string; validatorPda?: string }> = ({
  voteAccount,
  validatorPda,
}) => {
  const { data: metadata } = useValidatorMetadata(voteAccount);

  return (
    <>
      {metadata?.name && (
        <div className="flex items-center gap-2">
          {metadata.avatarUrl && (
            <img
              src={metadata.avatarUrl}
              alt={metadata.name}
              className="h-5 w-5 rounded-full"
              onError={(e) => {
                e.currentTarget.style.display = 'none';
              }}
            />
          )}
          <span className="font-medium">{metadata.name}</span>
        </div>
      )}
      {voteAccount && <AddressWithButtons address={voteAccount} label="Vote" />}
      {validatorPda && <AddressWithButtons address={validatorPda} label="Record" />}
    </>
  );
};
