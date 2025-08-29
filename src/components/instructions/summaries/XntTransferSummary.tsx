import React from 'react';
import { InstructionSummaryProps } from '@/lib/instructions/summaries/types';
import { formatXNT } from '@/lib/utils/formatters';
import { AddressWithButtons } from '@/components/AddressWithButtons';

/**
 * Summary component for XNT (native SOL) transfers
 * Handles both System Program Transfer instructions and XNT_TRANSFER type
 */
export const XntTransferSummary: React.FC<InstructionSummaryProps> = ({ instruction }) => {
  let amount: string | bigint | number;
  let fromAddress: string;
  let toAddress: string;

  // Try to get data from instruction.data first
  if (instruction.data) {
    const data = instruction.data as any;
    // For XNT transfers, the simpleDecoder sets: { from, to, lamports }
    if (data.lamports !== undefined && data.from && data.to) {
      amount = data.lamports;
      fromAddress = data.from;
      toAddress = data.to;
    } else if (data.amount !== undefined && data.from && data.to) {
      // Some cases might use 'amount' instead
      amount = data.amount;
      fromAddress = data.from;
      toAddress = data.to;
    } else {
      return null;
    }
  } else if (instruction.args?.lamports !== undefined) {
    // Fallback to args if no data
    amount = instruction.args.lamports;
    fromAddress = instruction.accounts?.[0]?.pubkey || 'Unknown';
    toAddress = instruction.accounts?.[1]?.pubkey || 'Unknown';
  } else {
    return null;
  }

  return (
    <div className="space-y-2 text-sm">
      <div className="font-semibold text-blue-600 dark:text-blue-400">XNT Transfer</div>
      <div className="space-y-1.5">
        <div className="grid grid-cols-[80px,1fr] gap-2">
          <span className="text-muted-foreground">Amount:</span>
          <span className="font-medium">{formatXNT(amount)}</span>
        </div>
        <AddressWithButtons address={fromAddress} label="From" />
        <AddressWithButtons address={toAddress} label="To" />
      </div>
    </div>
  );
};
