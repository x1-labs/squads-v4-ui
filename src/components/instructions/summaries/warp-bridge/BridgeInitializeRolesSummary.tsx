import React from 'react';
import { InstructionSummaryProps } from '@/lib/instructions/types';
import { AddressWithButtons } from '@/components/AddressWithButtons';

/**
 * Summary component for Warp Bridge initialize_roles instruction
 */
export const BridgeInitializeRolesSummary: React.FC<InstructionSummaryProps> = ({
  instruction,
}) => {
  const adminAddress = instruction.accounts?.[2]?.pubkey || 'Unknown';
  const rolesAddress = instruction.accounts?.[1]?.pubkey;

  return (
    <div className="space-y-3 text-sm">
      <div className="flex items-center gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-100 dark:bg-indigo-900/30">
          <span className="text-lg">👥</span>
        </div>
        <div className="flex-1">
          <div className="font-semibold text-indigo-600 dark:text-indigo-400">
            Initialize Roles
          </div>
          <div className="text-xs text-muted-foreground">
            Create roles account for access control
          </div>
        </div>
      </div>

      <div className="space-y-2 rounded-lg border border-border/50 bg-muted/30 p-3">
        <AddressWithButtons address={adminAddress} label="Admin" />
        {rolesAddress && <AddressWithButtons address={rolesAddress} label="Roles Account" />}
      </div>
    </div>
  );
};
