import React, { useState, useEffect } from 'react';
import { InstructionSummaryProps } from '@/lib/instructions/types';
import { AddressWithButtons } from '@/components/AddressWithButtons';
import { getTokenMetadata, TokenMetadata } from '@/lib/token/tokenMetadata';

/**
 * Summary component for Warp Bridge register_token instruction
 */
export const BridgeRegisterTokenSummary: React.FC<InstructionSummaryProps> = ({
  instruction,
  connection,
}) => {
  const [tokenMetadata, setTokenMetadata] = useState<TokenMetadata | null>(null);

  const localMint = instruction.args?.local_mint;
  const isNative = instruction.args?.is_native;
  const decimals = instruction.args?.decimals;
  const symbol = instruction.args?.symbol;
  const dailyCap = instruction.args?.daily_cap;
  const adminAddress = instruction.accounts?.[2]?.pubkey || 'Unknown';

  useEffect(() => {
    if (localMint) {
      getTokenMetadata(localMint, connection).then(setTokenMetadata).catch(console.warn);
    }
  }, [localMint, connection]);

  return (
    <div className="space-y-3 text-sm">
      <div className="flex items-center gap-3">
        {tokenMetadata?.logoURI && (
          <img
            src={tokenMetadata.logoURI}
            alt={symbol}
            className="h-8 w-8 rounded-full"
            onError={(e) => { e.currentTarget.style.display = 'none'; }}
          />
        )}
        {!tokenMetadata?.logoURI && (
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-cyan-100 dark:bg-cyan-900/30">
            <span className="text-lg">🪙</span>
          </div>
        )}
        <div className="flex-1">
          <div className="font-semibold text-cyan-600 dark:text-cyan-400">
            Register Token
          </div>
          <div className="text-xs text-muted-foreground">
            {symbol} ({isNative ? 'Native' : 'Wrapped'})
          </div>
        </div>
      </div>

      <div className="space-y-2 rounded-lg border border-border/50 bg-muted/30 p-3">
        <AddressWithButtons address={adminAddress} label="Admin" />
        {localMint && <AddressWithButtons address={localMint} label="Token Mint" />}

        <div className="grid grid-cols-2 gap-2 pt-2 border-t border-border/50">
          <div>
            <span className="text-xs text-muted-foreground">Decimals:</span>
            <span className="ml-2 font-mono">{decimals}</span>
          </div>
          <div>
            <span className="text-xs text-muted-foreground">Type:</span>
            <span className="ml-2 font-mono">{isNative ? 'Native' : 'Wrapped'}</span>
          </div>
        </div>
      </div>
    </div>
  );
};
