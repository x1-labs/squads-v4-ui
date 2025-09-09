import React from 'react';
import { InstructionSummaryProps } from '@/lib/instructions/types';
import { AddressWithButtons } from '@/components/AddressWithButtons';

/**
 * Summary component for Stake Initialize instructions
 */
export const InitializeStakeSummary: React.FC<InstructionSummaryProps> = ({ instruction }) => {
  // Get the stake account and authorities from the instruction
  const stakeAccount = instruction.accounts?.[0]?.pubkey;
  const staker = instruction.args?.authorized?.staker;
  const withdrawer = instruction.args?.authorized?.withdrawer;

  if (!stakeAccount) {
    return null;
  }

  return (
    <div className="space-y-2 text-sm">
      <div className="font-semibold text-cyan-600 dark:text-cyan-400">Initialize Stake</div>
      <div className="space-y-1.5">
        <AddressWithButtons address={stakeAccount} label="Stake Account" />
        {staker && <AddressWithButtons address={staker} label="Staker" />}
        {withdrawer && staker !== withdrawer && (
          <AddressWithButtons address={withdrawer} label="Withdrawer" />
        )}
      </div>
    </div>
  );
};
