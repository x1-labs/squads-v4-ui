import React from 'react';
import { InstructionSummaryProps } from '@/lib/instructions/types';
import { formatXNT } from '@/lib/utils/formatters';
import { AddressWithButtons } from '@/components/AddressWithButtons';

/**
 * Summary component for Stake Split instructions
 */
export const SplitStakeSummary: React.FC<InstructionSummaryProps> = ({ instruction }) => {
  // Get the split amount and accounts from the instruction
  const lamports = instruction.args?.lamports;
  const sourceStakeAccount = instruction.accounts?.[0]?.pubkey;
  const newStakeAccount = instruction.accounts?.[1]?.pubkey;
  const basePubkey = instruction.args?.basePubkey;
  const seed = instruction.args?.seed;

  if (!lamports || !sourceStakeAccount || !newStakeAccount) {
    return null;
  }

  // Check if this is a split with seed operation
  const isSplitWithSeed = seed && basePubkey;

  return (
    <div className="space-y-2 text-sm">
      <div className="font-semibold text-indigo-600 dark:text-indigo-400">
        {isSplitWithSeed ? 'Split Stake With Seed' : 'Split Stake'}
      </div>
      <div className="space-y-1.5">
        <div className="grid grid-cols-[80px,1fr] gap-2">
          <span className="text-muted-foreground">Amount:</span>
          <span className="font-medium">{formatXNT(lamports)}</span>
        </div>
        <AddressWithButtons address={sourceStakeAccount} label="From" />
        <AddressWithButtons address={newStakeAccount} label="To" />
        {isSplitWithSeed && seed && (
          <div className="grid grid-cols-[80px,1fr] gap-2">
            <span className="text-muted-foreground">Seed:</span>
            <span className="break-all font-mono text-xs">{seed}</span>
          </div>
        )}
      </div>
    </div>
  );
};
