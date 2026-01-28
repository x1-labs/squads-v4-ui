import React from 'react';
import { InstructionSummaryProps } from '@/lib/instructions/types';
import { AddressWithButtons } from '@/components/AddressWithButtons';

/**
 * Summary component for BPF Upgradeable Loader Upgrade instruction
 * Displays the program being upgraded and the buffer containing new code
 */
export const ProgramUpgradeSummary: React.FC<InstructionSummaryProps> = ({ instruction }) => {
  const data = instruction.data as any;

  // Try to get addresses from instruction data first, fall back to accounts
  const programAddress = data?.program || instruction.accounts?.[1]?.pubkey;
  const bufferAddress = data?.buffer || instruction.accounts?.[2]?.pubkey;
  const programDataAddress = data?.programData || instruction.accounts?.[0]?.pubkey;
  const spillAddress = data?.spillAddress || instruction.accounts?.[3]?.pubkey;
  const authority = data?.authority || instruction.accounts?.[6]?.pubkey;

  if (!programAddress && !bufferAddress) {
    return (
      <div className="flex items-center gap-2">
        <span>Program Upgrade</span>
      </div>
    );
  }

  return (
    <div className="space-y-3 text-sm">
      {/* Header */}
      <div className="flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-purple-500/20">
          <svg
            className="h-4 w-4 text-purple-500"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
            />
          </svg>
        </div>
        <div>
          <div className="font-semibold text-purple-600 dark:text-purple-400">Program Upgrade</div>
          <div className="text-xs text-muted-foreground">
            Deploying new program code from buffer
          </div>
        </div>
      </div>

      {/* Upgrade details */}
      <div className="space-y-2 rounded-lg border border-border/50 bg-muted/30 p-3">
        {programAddress && <AddressWithButtons address={programAddress} label="Program" />}
        {bufferAddress && <AddressWithButtons address={bufferAddress} label="Buffer" />}
        {programDataAddress && (
          <AddressWithButtons address={programDataAddress} label="Program Data" />
        )}
        {spillAddress && <AddressWithButtons address={spillAddress} label="Spill (Refund)" />}
        {authority && <AddressWithButtons address={authority} label="Authority" />}
      </div>
    </div>
  );
};
