import React, { useState, useEffect } from 'react';
import { PublicKey } from '@solana/web3.js';
import { InstructionSummaryProps } from '@/lib/instructions/types';
import { formatTokenAmount } from '@/lib/utils/formatters';
import { AddressWithButtons } from '@/components/AddressWithButtons';
import { getTokenMetadata, TokenMetadata } from '@/lib/token/tokenMetadata';

/**
 * Summary component for Warp Bridge bridge_in instruction
 * Displays token bridging in details (mint wrapped or release native)
 */
export const BridgeInSummary: React.FC<InstructionSummaryProps> = ({
  instruction,
  connection,
}) => {
  const [tokenMetadata, setTokenMetadata] = useState<TokenMetadata | null>(null);

  // Extract amount from args
  const amount = instruction.args?.amount;

  // Extract addresses from accounts
  // Account order for bridge_in:
  // 0: config, 1: token_registry, 2: incoming_msg, 3: payer,
  // 4: recipient, 5: recipient_token_account, 6: token_mint, etc.
  const recipientAddress = instruction.accounts?.[4]?.pubkey || 'Unknown';
  const tokenMintAddress = instruction.accounts?.[6]?.pubkey;

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
            <span className="font-semibold text-green-600 dark:text-green-400">
              Bridge In
            </span>
            <span className="text-lg font-bold text-foreground">
              {formattedAmount} {tokenSymbol}
            </span>
          </div>
          <div className="text-xs text-muted-foreground">Cross-chain transfer received</div>
        </div>
      </div>

      <div className="space-y-2 rounded-lg border border-border/50 bg-muted/30 p-3">
        <AddressWithButtons address={recipientAddress} label="Recipient" />
        {tokenMintAddress && (
          <AddressWithButtons address={tokenMintAddress} label="Token Mint" />
        )}
      </div>
    </div>
  );
};
