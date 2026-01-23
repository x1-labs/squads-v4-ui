import React, { useState, useEffect } from 'react';
import { PublicKey } from '@solana/web3.js';
import { InstructionSummaryProps } from '@/lib/instructions/types';
import { formatTokenAmount } from '@/lib/utils/formatters';
import { AddressWithButtons } from '@/components/AddressWithButtons';
import { getTokenMetadata, TokenMetadata } from '@/lib/token/tokenMetadata';

/**
 * Summary component for Warp Bridge bridge_out instruction
 * Displays token bridging out details (burn wrapped or lock native)
 */
export const BridgeOutSummary: React.FC<InstructionSummaryProps> = ({
  instruction,
  connection,
}) => {
  const [tokenMetadata, setTokenMetadata] = useState<TokenMetadata | null>(null);

  // Extract amount from args
  const amount = instruction.args?.amount;

  // Extract addresses from accounts
  // Account order for bridge_out:
  // 0: config, 1: token_registry, 2: outgoing_msg, 3: sender,
  // 4: sender_token_account, 5: token_mint, 6: vault (optional),
  // 7: vault_token_account (optional), 8: fee_collector, etc.
  const senderAddress = instruction.accounts?.[3]?.pubkey || 'Unknown';
  const tokenMintAddress = instruction.accounts?.[5]?.pubkey;

  useEffect(() => {
    if (tokenMintAddress) {
      getTokenMetadata(tokenMintAddress, connection).then(setTokenMetadata).catch(console.warn);
    }
  }, [tokenMintAddress, connection]);

  const decimals = tokenMetadata?.decimals || 9;
  const formattedAmount = formatTokenAmount(amount, decimals);
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
            <span className="font-semibold text-orange-600 dark:text-orange-400">
              Bridge Out
            </span>
            <span className="text-lg font-bold text-foreground">
              {formattedAmount} {tokenSymbol}
            </span>
          </div>
          <div className="text-xs text-muted-foreground">Cross-chain transfer</div>
        </div>
      </div>

      <div className="space-y-2 rounded-lg border border-border/50 bg-muted/30 p-3">
        <AddressWithButtons address={senderAddress} label="Sender" />
        {tokenMintAddress && (
          <AddressWithButtons address={tokenMintAddress} label="Token Mint" />
        )}
      </div>
    </div>
  );
};
