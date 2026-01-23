import React, { useState, useEffect } from 'react';
import { InstructionSummaryProps } from '@/lib/instructions/types';
import { AddressWithButtons } from '@/components/AddressWithButtons';
import { getTokenMetadata, TokenMetadata } from '@/lib/token/tokenMetadata';
import { formatTokenAmount } from '@/lib/utils/formatters';

/**
 * Summary component for Warp Bridge set_whale_limits instruction
 */
export const BridgeSetWhaleLimitsSummary: React.FC<InstructionSummaryProps> = ({
  instruction,
  connection,
}) => {
  const [tokenMetadata, setTokenMetadata] = useState<TokenMetadata | null>(null);

  const localMint = instruction.args?.local_mint;
  const whaleThreshold = instruction.args?.whale_threshold;
  const whaleDelaySeconds = instruction.args?.whale_delay_seconds;
  const adminAddress = instruction.accounts?.[2]?.pubkey || 'Unknown';

  useEffect(() => {
    if (localMint) {
      getTokenMetadata(localMint, connection).then(setTokenMetadata).catch(console.warn);
    }
  }, [localMint, connection]);

  const tokenSymbol = tokenMetadata?.symbol || 'Token';
  const decimals = tokenMetadata?.decimals || 9;

  const formatDelay = (seconds: number) => {
    if (seconds >= 86400) return `${Math.floor(seconds / 86400)} days`;
    if (seconds >= 3600) return `${Math.floor(seconds / 3600)} hours`;
    if (seconds >= 60) return `${Math.floor(seconds / 60)} minutes`;
    return `${seconds} seconds`;
  };

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
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/30">
            <span className="text-lg">🐋</span>
          </div>
        )}
        <div className="flex-1">
          <div className="font-semibold text-amber-600 dark:text-amber-400">
            Set Whale Limits
          </div>
          <div className="text-xs text-muted-foreground">
            Configure large transfer delays for {tokenSymbol}
          </div>
        </div>
      </div>

      <div className="space-y-2 rounded-lg border border-border/50 bg-muted/30 p-3">
        <AddressWithButtons address={adminAddress} label="Admin" />
        {localMint && <AddressWithButtons address={localMint} label="Token Mint" />}

        <div className="grid grid-cols-2 gap-2 pt-2 border-t border-border/50">
          {whaleThreshold !== undefined && (
            <div>
              <span className="text-xs text-muted-foreground">Threshold:</span>
              <span className="ml-2 font-mono">{formatTokenAmount(whaleThreshold, decimals)} {tokenSymbol}</span>
            </div>
          )}
          {whaleDelaySeconds !== undefined && (
            <div>
              <span className="text-xs text-muted-foreground">Delay:</span>
              <span className="ml-2 font-mono">{formatDelay(Number(whaleDelaySeconds))}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
