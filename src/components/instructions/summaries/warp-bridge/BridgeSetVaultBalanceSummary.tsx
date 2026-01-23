import React, { useState, useEffect } from 'react';
import { InstructionSummaryProps } from '@/lib/instructions/types';
import { AddressWithButtons } from '@/components/AddressWithButtons';
import { formatTokenAmount } from '@/lib/utils/formatters';

/**
 * Summary component for Warp Bridge set_vault_balance instruction
 */
export const BridgeSetVaultBalanceSummary: React.FC<InstructionSummaryProps> = ({
  instruction,
}) => {
  const totalLocked = instruction.args?.total_locked;
  const adminAddress = instruction.accounts?.[2]?.pubkey || 'Unknown';
  const vaultAddress = instruction.accounts?.[1]?.pubkey;

  return (
    <div className="space-y-3 text-sm">
      <div className="flex items-center gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-teal-100 dark:bg-teal-900/30">
          <span className="text-lg">📊</span>
        </div>
        <div className="flex-1">
          <div className="font-semibold text-teal-600 dark:text-teal-400">
            Set Vault Balance
          </div>
          <div className="text-xs text-muted-foreground">
            Update vault locked balance (migration)
          </div>
        </div>
      </div>

      <div className="space-y-2 rounded-lg border border-border/50 bg-muted/30 p-3">
        <AddressWithButtons address={adminAddress} label="Admin" />
        {vaultAddress && <AddressWithButtons address={vaultAddress} label="Vault" />}

        {totalLocked !== undefined && (
          <div className="pt-2 border-t border-border/50">
            <span className="text-xs text-muted-foreground">Total Locked:</span>
            <span className="ml-2 font-mono">{formatTokenAmount(totalLocked, 9)}</span>
          </div>
        )}
      </div>
    </div>
  );
};
