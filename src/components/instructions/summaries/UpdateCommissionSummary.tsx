import React from 'react';
import { InstructionSummaryProps } from '@/lib/instructions/types';
import { AddressWithButtons } from '@/components/AddressWithButtons';

export const UpdateCommissionSummary: React.FC<InstructionSummaryProps> = ({ instruction }) => {
  const info = instruction.data as any;
  
  console.log('UpdateCommissionSummary - instruction:', instruction);
  console.log('UpdateCommissionSummary - info:', info);
  
  if (!info) {
    return (
      <div className="flex items-center gap-2">
        <span>Update validator commission</span>
      </div>
    );
  }

  const commission = info.commission ?? 0;

  return (
    <div className="space-y-2 text-sm">
      <div className="font-semibold text-purple-600 dark:text-purple-400">
        Update Commission to {commission}%
      </div>
      {info.voteAccount && (
        <div className="space-y-1.5">
          <AddressWithButtons address={info.voteAccount} label="Validator" />
        </div>
      )}
    </div>
  );
};