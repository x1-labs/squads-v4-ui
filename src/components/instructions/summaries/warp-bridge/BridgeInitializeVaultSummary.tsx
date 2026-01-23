import React, { useState, useEffect } from 'react';
import { InstructionSummaryProps } from '@/lib/instructions/types';
import { AddressWithButtons } from '@/components/AddressWithButtons';
import { getTokenMetadata, TokenMetadata } from '@/lib/token/tokenMetadata';

/**
 * Summary component for Warp Bridge initialize_vault instruction
 */
export const BridgeInitializeVaultSummary: React.FC<InstructionSummaryProps> = ({
  instruction,
  connection,
}) => {
  const [tokenMetadata, setTokenMetadata] = useState<TokenMetadata | null>(null);

  const localMint = instruction.args?.local_mint;
  const adminAddress = instruction.accounts?.[5]?.pubkey || 'Unknown';
  const vaultAddress = instruction.accounts?.[2]?.pubkey;

  useEffect(() => {
    if (localMint) {
      getTokenMetadata(localMint, connection).then(setTokenMetadata).catch(console.warn);
    }
  }, [localMint, connection]);

  const tokenSymbol = tokenMetadata?.symbol || 'Token';

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
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-teal-100 dark:bg-teal-900/30">
            <span className="text-lg">🏦</span>
          </div>
        )}
        <div className="flex-1">
          <div className="font-semibold text-teal-600 dark:text-teal-400">
            Initialize Vault
          </div>
          <div className="text-xs text-muted-foreground">
            Create vault for {tokenSymbol}
          </div>
        </div>
      </div>

      <div className="space-y-2 rounded-lg border border-border/50 bg-muted/30 p-3">
        <AddressWithButtons address={adminAddress} label="Admin" />
        {localMint && <AddressWithButtons address={localMint} label="Token Mint" />}
        {vaultAddress && <AddressWithButtons address={vaultAddress} label="Vault" />}
      </div>
    </div>
  );
};
