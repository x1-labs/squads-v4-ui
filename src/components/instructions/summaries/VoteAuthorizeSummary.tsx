import React from 'react';
import { InstructionSummaryProps } from '@/lib/instructions/types';
import { AddressWithButtons } from '@/components/AddressWithButtons';

export const VoteAuthorizeSummary: React.FC<InstructionSummaryProps> = ({ instruction }) => {
  const info = instruction.data as any;
  
  if (!info) {
    return (
      <div className="flex items-center gap-2">
        <span>Change vote account authority</span>
      </div>
    );
  }

  const authorityType = info.authorityType || 'Authority';

  return (
    <div className="space-y-2 text-sm">
      <div className="font-semibold text-blue-600 dark:text-blue-400">
        Change Authorized {authorityType}
      </div>
      <div className="space-y-1.5">
        {info.voteAccount && (
          <AddressWithButtons address={info.voteAccount} label="Validator" />
        )}
        {info.authority && (
          <AddressWithButtons address={info.authority} label="Old" />
        )}
        {info.newAuthority && (
          <AddressWithButtons address={info.newAuthority} label="New" />
        )}
      </div>
    </div>
  );
};