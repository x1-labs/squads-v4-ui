import React from 'react';
import { InstructionSummaryProps } from '@/lib/instructions/types';
import { AddressWithButtons } from '@/components/AddressWithButtons';

/**
 * Summary component for Warp Bridge migrate_config instruction
 */
export const BridgeMigrateConfigSummary: React.FC<InstructionSummaryProps> = ({
  instruction,
}) => {
  const adminAddress = instruction.accounts?.[1]?.pubkey || 'Unknown';
  const configAddress = instruction.accounts?.[0]?.pubkey;

  return (
    <div className="space-y-3 text-sm">
      <div className="flex items-center gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-yellow-100 dark:bg-yellow-900/30">
          <span className="text-lg">🔄</span>
        </div>
        <div className="flex-1">
          <div className="font-semibold text-yellow-600 dark:text-yellow-400">
            Migrate Config
          </div>
          <div className="text-xs text-muted-foreground">
            Resize config account for upgrade
          </div>
        </div>
      </div>

      <div className="space-y-2 rounded-lg border border-border/50 bg-muted/30 p-3">
        <AddressWithButtons address={adminAddress} label="Admin" />
        {configAddress && <AddressWithButtons address={configAddress} label="Config" />}
      </div>
    </div>
  );
};
