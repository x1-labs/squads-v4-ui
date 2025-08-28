import React from 'react';
import { XntTransferData } from '@/lib/transaction/instructionTypes';
import { formatXntAmount } from './utils';

interface Props {
  data: XntTransferData;
}

export function XntTransferDisplay({ data }: Props) {
  const amount = formatXntAmount(data.lamports);

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-foreground">XNT Transfer</h3>

      <div className="space-y-1">
        <div className="text-sm text-muted-foreground">From:</div>
        <div className="pl-4">
          <code className="break-all font-mono text-xs text-foreground">{data.from}</code>
        </div>
      </div>

      <div className="space-y-1">
        <div className="text-sm text-muted-foreground">To:</div>
        <div className="pl-4">
          <code className="break-all font-mono text-xs text-foreground">{data.to}</code>
        </div>
      </div>

      <div className="space-y-1">
        <div className="text-sm text-muted-foreground">Amount:</div>
        <div className="pl-4 font-semibold text-foreground">{amount} XNT</div>
      </div>
    </div>
  );
}
