import React from 'react';
import { InstructionSummaryProps } from '@/lib/instructions/types';
import { AddressWithButtons } from '@/components/AddressWithButtons';

/**
 * Summary component for Warp Bridge set_guardians instruction
 */
export const BridgeSetGuardiansSummary: React.FC<InstructionSummaryProps> = ({
  instruction,
}) => {
  const guardians = instruction.args?.guardians || [];
  const threshold = instruction.args?.threshold;
  const adminAddress = instruction.accounts?.[1]?.pubkey || 'Unknown';

  return (
    <div className="space-y-3 text-sm">
      <div className="flex items-center gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900/30">
          <span className="text-lg">🛡️</span>
        </div>
        <div className="flex-1">
          <div className="font-semibold text-blue-600 dark:text-blue-400">
            Set Guardians
          </div>
          <div className="text-xs text-muted-foreground">
            Update guardian set: {threshold}/{guardians.length} threshold
          </div>
        </div>
      </div>

      <div className="space-y-2 rounded-lg border border-border/50 bg-muted/30 p-3">
        <AddressWithButtons address={adminAddress} label="Admin" />
        <div className="pt-2 border-t border-border/50">
          <div className="text-xs text-muted-foreground mb-1">Guardians ({guardians.length}):</div>
          {guardians.slice(0, 5).map((guardian: string, i: number) => (
            <AddressWithButtons key={i} address={guardian} label={`Guardian ${i + 1}`} />
          ))}
        </div>
      </div>
    </div>
  );
};
