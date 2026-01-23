import React from 'react';
import { InstructionSummaryProps } from '@/lib/instructions/types';
import { AddressWithButtons } from '@/components/AddressWithButtons';

/**
 * Summary component for Warp Bridge transfer_admin instruction
 */
export const BridgeTransferAdminSummary: React.FC<InstructionSummaryProps> = ({
  instruction,
}) => {
  const newAdmin = instruction.args?.new_admin;
  const currentAdmin = instruction.accounts?.[1]?.pubkey || 'Unknown';

  return (
    <div className="space-y-3 text-sm">
      <div className="flex items-center gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-purple-100 dark:bg-purple-900/30">
          <span className="text-lg">👤</span>
        </div>
        <div className="flex-1">
          <div className="font-semibold text-purple-600 dark:text-purple-400">
            Transfer Admin
          </div>
          <div className="text-xs text-muted-foreground">
            Transfer bridge admin authority
          </div>
        </div>
      </div>

      <div className="space-y-2 rounded-lg border border-border/50 bg-muted/30 p-3">
        <AddressWithButtons address={currentAdmin} label="Current Admin" />
        {newAdmin && <AddressWithButtons address={newAdmin} label="New Admin" />}
      </div>
    </div>
  );
};
