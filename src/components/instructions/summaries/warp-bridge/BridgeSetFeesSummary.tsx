import React from 'react';
import { InstructionSummaryProps } from '@/lib/instructions/types';
import { AddressWithButtons } from '@/components/AddressWithButtons';
import { formatXNT } from '@/lib/utils/formatters';

/**
 * Summary component for Warp Bridge set_fees instruction
 */
export const BridgeSetFeesSummary: React.FC<InstructionSummaryProps> = ({
  instruction,
}) => {
  const flatFeeLamports = instruction.args?.flat_fee_lamports;
  const percentageFeeBps = instruction.args?.percentage_fee_bps;
  const adminAddress = instruction.accounts?.[1]?.pubkey || 'Unknown';

  return (
    <div className="space-y-3 text-sm">
      <div className="flex items-center gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-900/30">
          <span className="text-lg">💰</span>
        </div>
        <div className="flex-1">
          <div className="font-semibold text-gray-600 dark:text-gray-400">
            Set Fees
          </div>
          <div className="text-xs text-muted-foreground">
            Update bridge fee configuration
          </div>
        </div>
      </div>

      <div className="space-y-2 rounded-lg border border-border/50 bg-muted/30 p-3">
        <AddressWithButtons address={adminAddress} label="Admin" />
        <div className="grid grid-cols-2 gap-2 pt-2 border-t border-border/50">
          {flatFeeLamports !== undefined && (
            <div>
              <span className="text-xs text-muted-foreground">Flat Fee:</span>
              <span className="ml-2 font-mono">{formatXNT(flatFeeLamports)}</span>
            </div>
          )}
          {percentageFeeBps !== undefined && (
            <div>
              <span className="text-xs text-muted-foreground">Fee %:</span>
              <span className="ml-2 font-mono">{(percentageFeeBps / 100).toFixed(2)}%</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
