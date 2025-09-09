import React from 'react';
import { InstructionSummaryProps } from '@/lib/instructions/types';
import { formatXNT } from '@/lib/utils/formatters';
import { AddressWithButtons } from '@/components/AddressWithButtons';

/**
 * Summary component for Stake Withdraw instructions
 */
export const WithdrawStakeSummary: React.FC<InstructionSummaryProps> = ({ instruction }) => {
  // Get the withdrawal amount and accounts from the instruction
  const lamports = instruction.args?.lamports;
  const stakeAccount = instruction.accounts?.[0]?.pubkey;
  const recipient = instruction.accounts?.[1]?.pubkey;

  if (!lamports || !stakeAccount) {
    return null;
  }

  return (
    <div className="space-y-2 text-sm">
      <div className="font-semibold text-blue-600 dark:text-blue-400">Withdraw Stake</div>
      <div className="space-y-1.5">
        <div className="grid grid-cols-[80px,1fr] gap-2">
          <span className="text-muted-foreground">Amount:</span>
          <span className="font-medium">{formatXNT(lamports)}</span>
        </div>
        <AddressWithButtons address={stakeAccount} label="Stake Account" />
        {recipient && <AddressWithButtons address={recipient} label="To" />}
      </div>
    </div>
  );
};
