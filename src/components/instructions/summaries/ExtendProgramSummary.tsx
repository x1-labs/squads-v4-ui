import React from 'react';
import { InstructionSummaryProps } from '@/lib/instructions/types';
import { AddressWithButtons } from '@/components/AddressWithButtons';

/**
 * Summary component for BPF Upgradeable Loader ExtendProgram instruction
 * Displays the program being extended and the number of additional bytes
 */
export const ExtendProgramSummary: React.FC<InstructionSummaryProps> = ({ instruction }) => {
  const data = instruction.data as any;
  const args = instruction.args as any;

  // Try to get addresses from instruction data first, fall back to accounts
  const programDataAddress = data?.programData || instruction.accounts?.[0]?.pubkey;
  const programAddress = data?.program || instruction.accounts?.[1]?.pubkey;
  const payerAddress = data?.payer || instruction.accounts?.[3]?.pubkey;

  const additionalBytes = data?.additionalBytes ?? args?.additionalBytes;

  if (!programAddress && !programDataAddress) {
    return (
      <div className="flex items-center gap-2">
        <span>Extend Program</span>
      </div>
    );
  }

  return (
    <div className="space-y-3 text-sm">
      {/* Header */}
      <div className="flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-cyan-500/20">
          <svg
            className="h-4 w-4 text-cyan-500"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"
            />
          </svg>
        </div>
        <div>
          <div className="font-semibold text-cyan-600 dark:text-cyan-400">Extend Program</div>
          <div className="text-xs text-muted-foreground">
            Increasing program account size for larger deployments
          </div>
        </div>
      </div>

      {/* Extension details */}
      <div className="space-y-2 rounded-lg border border-border/50 bg-muted/30 p-3">
        {programAddress && <AddressWithButtons address={programAddress} label="Program" />}
        {programDataAddress && (
          <AddressWithButtons address={programDataAddress} label="Program Data" />
        )}
        {payerAddress && <AddressWithButtons address={payerAddress} label="Payer" />}
        {additionalBytes !== undefined && (
          <div className="flex items-center justify-between border-t border-border/50 pt-2">
            <span className="text-muted-foreground">Additional Bytes</span>
            <span className="font-mono font-medium">
              {Number(additionalBytes).toLocaleString()} bytes
            </span>
          </div>
        )}
      </div>
    </div>
  );
};