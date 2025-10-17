import React from 'react';
import { InstructionSummaryProps } from '@/lib/instructions/types';
import { AddressWithButtons } from '@/components/AddressWithButtons';

/**
 * Summary component for Stake Merge instructions
 */
export const MergeStakeSummary: React.FC<InstructionSummaryProps> = ({ instruction }) => {
  // Get the accounts from the instruction
  const destinationStakeAccount = instruction.accounts?.[0]?.pubkey;
  const sourceStakeAccount = instruction.accounts?.[1]?.pubkey;

  if (!destinationStakeAccount || !sourceStakeAccount) {
    return null;
  }

  return (
    <div className="space-y-2 text-sm">
      <div className="font-semibold text-cyan-600 dark:text-cyan-400">Merge Stakes</div>
      <div className="space-y-1.5">
        <AddressWithButtons address={destinationStakeAccount} label="Destination" />
        <AddressWithButtons address={sourceStakeAccount} label="Source (will be closed)" />
        <div className="rounded bg-yellow-50 p-2 text-xs text-yellow-700 dark:bg-yellow-950/30 dark:text-yellow-400">
          Source account will be permanently closed and its balance merged into the destination
          account.
        </div>
      </div>
    </div>
  );
};
