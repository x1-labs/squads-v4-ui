import React from 'react';
import { InstructionSummaryProps } from '@/lib/instructions/types';
import { formatXNT, formatXNTCompact } from '@/lib/utils/formatters';
import { AddressWithButtons } from '@/components/AddressWithButtons';

/**
 * Summary component for System CreateAccountWithSeed instructions
 */
export const CreateAccountWithSeedSummary: React.FC<InstructionSummaryProps> = ({
  instruction,
}) => {
  // Get the create account details from args
  const lamports = instruction.args?.lamports;
  const space = instruction.args?.space;
  const owner = instruction.args?.owner;
  const seed = instruction.args?.seed;
  const base = instruction.args?.base;

  // Get accounts
  const fundingAccount = instruction.accounts?.[0]?.pubkey;
  const createdAccount = instruction.accounts?.[1]?.pubkey;

  if (!lamports) {
    return null;
  }

  // Check if this is a stake account creation (owner is Stake Program)
  const isStakeAccount = owner === 'Stake11111111111111111111111111111111111111';

  return (
    <div className="space-y-2 text-sm">
      <div className="font-semibold text-blue-600 dark:text-blue-400">
        {isStakeAccount ? 'Create Stake Account' : 'Create Account With Seed'}
      </div>
      <div className="space-y-1.5">
        <div className="grid grid-cols-[80px,1fr] gap-2">
          <span className="text-muted-foreground">Amount:</span>
          <span className="font-medium" title={formatXNT(lamports)}>
            {formatXNTCompact(lamports)}
          </span>
        </div>
        {createdAccount && <AddressWithButtons address={createdAccount} label="New Account" />}
        {fundingAccount && <AddressWithButtons address={fundingAccount} label="Funding" />}
        {seed && (
          <div className="grid grid-cols-[80px,1fr] gap-2">
            <span className="text-muted-foreground">Seed:</span>
            <span className="font-mono text-xs">{seed}</span>
          </div>
        )}
      </div>
    </div>
  );
};
