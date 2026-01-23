import React, { useState, useEffect } from 'react';
import { InstructionSummaryProps } from '@/lib/instructions/types';
import { AddressWithButtons } from '@/components/AddressWithButtons';
import { getTokenMetadata, TokenMetadata } from '@/lib/token/tokenMetadata';
import { formatTokenAmount } from '@/lib/utils/formatters';

/**
 * Summary component for Warp Bridge update_token_registry instruction
 */
export const BridgeUpdateTokenRegistrySummary: React.FC<InstructionSummaryProps> = ({
  instruction,
  connection,
}) => {
  const [tokenMetadata, setTokenMetadata] = useState<TokenMetadata | null>(null);

  const localMint = instruction.args?.local_mint;
  const paused = instruction.args?.paused;
  const dailyCap = instruction.args?.daily_cap;
  const minAmount = instruction.args?.min_amount;
  const maxAmount = instruction.args?.max_amount;
  const adminAddress = instruction.accounts?.[2]?.pubkey || 'Unknown';

  useEffect(() => {
    if (localMint) {
      getTokenMetadata(localMint, connection).then(setTokenMetadata).catch(console.warn);
    }
  }, [localMint, connection]);

  const tokenSymbol = tokenMetadata?.symbol || 'Token';
  const decimals = tokenMetadata?.decimals || 9;

  return (
    <div className="space-y-3 text-sm">
      <div className="flex items-center gap-3">
        {tokenMetadata?.logoURI && (
          <img
            src={tokenMetadata.logoURI}
            alt={tokenSymbol}
            className="h-8 w-8 rounded-full"
            onError={(e) => { e.currentTarget.style.display = 'none'; }}
          />
        )}
        {!tokenMetadata?.logoURI && (
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900/30">
            <span className="text-lg">⚙️</span>
          </div>
        )}
        <div className="flex-1">
          <div className="font-semibold text-blue-600 dark:text-blue-400">
            Update Token Registry
          </div>
          <div className="text-xs text-muted-foreground">
            Update {tokenSymbol} settings
          </div>
        </div>
      </div>

      <div className="space-y-2 rounded-lg border border-border/50 bg-muted/30 p-3">
        <AddressWithButtons address={adminAddress} label="Admin" />
        {localMint && <AddressWithButtons address={localMint} label="Token Mint" />}

        <div className="grid grid-cols-2 gap-2 pt-2 border-t border-border/50">
          {paused !== null && paused !== undefined && (
            <div>
              <span className="text-xs text-muted-foreground">Paused:</span>
              <span className={`ml-2 font-mono ${paused ? 'text-red-500' : 'text-green-500'}`}>
                {paused ? 'Yes' : 'No'}
              </span>
            </div>
          )}
          {dailyCap !== null && dailyCap !== undefined && (
            <div>
              <span className="text-xs text-muted-foreground">Daily Cap:</span>
              <span className="ml-2 font-mono">{formatTokenAmount(dailyCap, decimals)}</span>
            </div>
          )}
          {minAmount !== null && minAmount !== undefined && (
            <div>
              <span className="text-xs text-muted-foreground">Min:</span>
              <span className="ml-2 font-mono">{formatTokenAmount(minAmount, decimals)}</span>
            </div>
          )}
          {maxAmount !== null && maxAmount !== undefined && (
            <div>
              <span className="text-xs text-muted-foreground">Max:</span>
              <span className="ml-2 font-mono">{formatTokenAmount(maxAmount, decimals)}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
