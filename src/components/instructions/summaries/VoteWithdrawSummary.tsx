import React from 'react';
import { InstructionSummaryProps } from '@/lib/instructions/types';
import { LAMPORTS_PER_SOL } from '@solana/web3.js';
import { AddressWithButtons } from '@/components/AddressWithButtons';
import { formatXNT } from '@/lib/utils/formatters';

export const VoteWithdrawSummary: React.FC<InstructionSummaryProps> = ({ instruction }) => {
  const info = instruction.data as any;
  
  if (!info) {
    return (
      <div className="flex items-center gap-2">
        <span>Withdraw from vote account</span>
      </div>
    );
  }

  const amount = info.lamports || 0;

  return (
    <div className="space-y-2 text-sm">
      <div className="font-semibold text-green-600 dark:text-green-400">
        Withdraw Rewards
      </div>
      <div className="space-y-1.5">
        <div className="grid grid-cols-[80px,1fr] gap-2">
          <span className="text-muted-foreground">Amount:</span>
          <span className="font-medium">{formatXNT(amount)}</span>
        </div>
        {info.voteAccount && (
          <AddressWithButtons address={info.voteAccount} label="From" />
        )}
        {info.destination && (
          <AddressWithButtons address={info.destination} label="To" />
        )}
      </div>
    </div>
  );
};