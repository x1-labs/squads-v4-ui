import React from 'react';
import { InstructionSummaryProps } from '@/lib/instructions/types';
import { AddressWithButtons } from '@/components/AddressWithButtons';

/**
 * Summary component for Warp Bridge pause instruction
 */
export const BridgePauseSummary: React.FC<InstructionSummaryProps> = ({
  instruction,
}) => {
  // Extract the pause reason from args
  const reason = instruction.args?.reason;

  // Extract authority from accounts
  // Account order for pause: 0: config, 1: roles (optional), 2: authority
  const authorityAddress = instruction.accounts?.[2]?.pubkey || instruction.accounts?.[1]?.pubkey || 'Unknown';

  // Map reason enum to display text
  const getReasonText = (reason: any): string => {
    if (!reason) return 'Unknown';
    if (typeof reason === 'string') return reason;
    if (typeof reason === 'object') {
      const key = Object.keys(reason)[0];
      if (key === 'other' && reason.other?.code !== undefined) {
        return `Other (code: ${reason.other.code})`;
      }
      return key.replace(/([A-Z])/g, ' $1').trim();
    }
    return 'Unknown';
  };

  return (
    <div className="space-y-3 text-sm">
      <div className="flex items-center gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30">
          <span className="text-lg">⏸</span>
        </div>
        <div className="flex-1">
          <div className="font-semibold text-red-600 dark:text-red-400">
            Pause Bridge
          </div>
          <div className="text-xs text-muted-foreground">
            Reason: {getReasonText(reason)}
          </div>
        </div>
      </div>

      <div className="space-y-2 rounded-lg border border-border/50 bg-muted/30 p-3">
        <AddressWithButtons address={authorityAddress} label="Authority" />
      </div>
    </div>
  );
};
