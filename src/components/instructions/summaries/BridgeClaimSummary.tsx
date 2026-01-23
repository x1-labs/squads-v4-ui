import React, { useState, useEffect } from 'react';
import { InstructionSummaryProps } from '@/lib/instructions/types';
import { AddressWithButtons } from '@/components/AddressWithButtons';
import { getTokenMetadata, TokenMetadata } from '@/lib/token/tokenMetadata';

/**
 * Summary component for Warp Bridge claim instruction
 * Displays details for claiming delayed whale transfers
 */
export const BridgeClaimSummary: React.FC<InstructionSummaryProps> = ({
  instruction,
  connection,
}) => {
  const [tokenMetadata, setTokenMetadata] = useState<TokenMetadata | null>(null);

  // Extract addresses from accounts
  // Account order for claim:
  // 0: config, 1: token_registry, 2: incoming_msg, 3: claimer,
  // 4: claimer_token_account, 5: token_mint, etc.
  const claimerAddress = instruction.accounts?.[3]?.pubkey || 'Unknown';
  const tokenMintAddress = instruction.accounts?.[5]?.pubkey;

  useEffect(() => {
    if (tokenMintAddress) {
      getTokenMetadata(tokenMintAddress, connection).then(setTokenMetadata).catch(console.warn);
    }
  }, [tokenMintAddress, connection]);

  const tokenSymbol = tokenMetadata?.symbol || 'tokens';

  return (
    <div className="space-y-3 text-sm">
      <div className="flex items-center gap-3">
        {tokenMetadata?.logoURI && (
          <img
            src={tokenMetadata.logoURI}
            alt={tokenSymbol}
            className="h-8 w-8 rounded-full"
            onError={(e) => {
              e.currentTarget.style.display = 'none';
            }}
          />
        )}
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-blue-600 dark:text-blue-400">
              Claim Bridge Transfer
            </span>
          </div>
          <div className="text-xs text-muted-foreground">Delayed transfer claim</div>
        </div>
      </div>

      <div className="space-y-2 rounded-lg border border-border/50 bg-muted/30 p-3">
        <AddressWithButtons address={claimerAddress} label="Claimer" />
        {tokenMintAddress && (
          <AddressWithButtons address={tokenMintAddress} label="Token Mint" />
        )}
      </div>
    </div>
  );
};
