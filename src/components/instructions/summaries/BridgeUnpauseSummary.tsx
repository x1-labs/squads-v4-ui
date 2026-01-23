import React from 'react';
import { InstructionSummaryProps } from '@/lib/instructions/types';
import { AddressWithButtons } from '@/components/AddressWithButtons';

/**
 * Summary component for Warp Bridge unpause instruction
 */
export const BridgeUnpauseSummary: React.FC<InstructionSummaryProps> = ({
  instruction,
}) => {
  // Extract admin from accounts
  // Account order for unpause: 0: config, 1: admin
  const adminAddress = instruction.accounts?.[1]?.pubkey || 'Unknown';

  return (
    <div className="space-y-3 text-sm">
      <div className="flex items-center gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
          <span className="text-lg">▶</span>
        </div>
        <div className="flex-1">
          <div className="font-semibold text-green-600 dark:text-green-400">
            Unpause Bridge
          </div>
          <div className="text-xs text-muted-foreground">
            Resume bridge operations
          </div>
        </div>
      </div>

      <div className="space-y-2 rounded-lg border border-border/50 bg-muted/30 p-3">
        <AddressWithButtons address={adminAddress} label="Admin" />
      </div>
    </div>
  );
};
