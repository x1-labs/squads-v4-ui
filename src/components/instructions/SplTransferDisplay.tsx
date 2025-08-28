import React from 'react';
import { Connection } from '@solana/web3.js';
import { SplTransferData } from '@/lib/transaction/instructionTypes';
import { TokenMetadata } from '@/lib/token/tokenMetadata';
import { formatTokenAmount } from './utils';

interface Props {
  data: SplTransferData;
  tokenMetadata?: TokenMetadata | null;
  connection?: Connection;
}

export function SplTransferDisplay({ data, tokenMetadata }: Props) {
  const formattedAmount = formatTokenAmount(data.amount, data.decimals);

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-foreground">SPL Transfer</h3>

      {/* Token Information */}
      <div className="space-y-1">
        <div className="text-sm text-muted-foreground">Token:</div>
        <div className="pl-4">
          {tokenMetadata && (
            <div className="font-medium text-foreground">
              {tokenMetadata.symbol} - {tokenMetadata.name || 'Unknown Token'}
            </div>
          )}
          {data.mint && (
            <code className="break-all font-mono text-xs text-muted-foreground">{data.mint}</code>
          )}
        </div>
      </div>

      {/* From Address */}
      <div className="space-y-1">
        <div className="text-sm text-muted-foreground">From:</div>
        <div className="pl-4">
          <code className="break-all font-mono text-xs text-foreground">
            {data.fromTokenAccount}
          </code>
          {data.fromOwner && (
            <div className="mt-0.5 text-xs text-muted-foreground">
              Owner: <code className="font-mono">{data.fromOwner}</code>
            </div>
          )}
        </div>
      </div>

      {/* To Address */}
      <div className="space-y-1">
        <div className="text-sm text-muted-foreground">To:</div>
        <div className="pl-4">
          <code className="break-all font-mono text-xs text-foreground">{data.toTokenAccount}</code>
          {data.toOwner && (
            <div className="mt-0.5 text-xs text-muted-foreground">
              Owner: <code className="font-mono">{data.toOwner}</code>
            </div>
          )}
        </div>
      </div>

      {/* Amount */}
      <div className="space-y-1">
        <div className="text-sm text-muted-foreground">Amount:</div>
        <div className="pl-4 font-semibold text-foreground">
          {formattedAmount} {tokenMetadata?.symbol || ''}
        </div>
      </div>
    </div>
  );
}
