import React from 'react';
import { InstructionSummaryProps } from '@/lib/instructions/types';
import { AddressWithButtons } from '@/components/AddressWithButtons';

/**
 * Summary component for Warp Bridge set_role instruction
 */
export const BridgeSetRoleSummary: React.FC<InstructionSummaryProps> = ({
  instruction,
}) => {
  const roleType = instruction.args?.role_type;
  const pubkey = instruction.args?.pubkey;
  const adminAddress = instruction.accounts?.[2]?.pubkey || 'Unknown';

  const getRoleText = (role: any): string => {
    if (!role) return 'Unknown';
    if (typeof role === 'string') return role;
    if (typeof role === 'object') {
      const key = Object.keys(role)[0];
      return key.charAt(0).toUpperCase() + key.slice(1).replace(/([A-Z])/g, ' $1');
    }
    return 'Unknown';
  };

  return (
    <div className="space-y-3 text-sm">
      <div className="flex items-center gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-100 dark:bg-indigo-900/30">
          <span className="text-lg">🔑</span>
        </div>
        <div className="flex-1">
          <div className="font-semibold text-indigo-600 dark:text-indigo-400">
            Set Role
          </div>
          <div className="text-xs text-muted-foreground">
            {pubkey ? `Assign ${getRoleText(roleType)} role` : `Remove ${getRoleText(roleType)} role`}
          </div>
        </div>
      </div>

      <div className="space-y-2 rounded-lg border border-border/50 bg-muted/30 p-3">
        <AddressWithButtons address={adminAddress} label="Admin" />
        {pubkey && <AddressWithButtons address={pubkey} label={getRoleText(roleType)} />}
      </div>
    </div>
  );
};
