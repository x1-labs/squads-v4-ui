import React, { useState, useEffect } from 'react';
import { PublicKey } from '@solana/web3.js';
import { InstructionSummaryProps } from '@/lib/instructions/types';
import { formatTokenAmount } from '@/lib/utils/formatters';
import { AddressWithButtons } from '@/components/AddressWithButtons';
import { getTokenMetadata, TokenMetadata } from '@/lib/token/tokenMetadata';
import { MintToData } from '@/lib/transaction/instructionTypes';

/**
 * Summary component for SPL Token MintTo and MintToChecked instructions
 */
export const SplMintSummary: React.FC<InstructionSummaryProps> = ({ instruction, connection }) => {
  const [tokenMetadata, setTokenMetadata] = useState<TokenMetadata | null>(null);
  const [destinationOwner, setDestinationOwner] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Debug log the instruction structure
  console.log('SplMintSummary instruction:', {
    instructionName: instruction.instructionName,
    data: instruction.data,
    args: instruction.args,
    accounts: instruction.accounts,
  });

  // Try to get data from instruction.data first, then fall back to args/accounts
  const typedData = instruction.data as MintToData | undefined;

  // Get amount - from typed data or args
  const amount = typedData?.amount || instruction.args?.amount;
  if (!amount) {
    console.log('SplMintSummary: No amount found, returning null');
    return null;
  }

  // Get accounts - from typed data or instruction.accounts array
  // MintTo/MintToChecked accounts: [mint, destination, authority]
  const mintAddress =
    typedData?.mint ||
    instruction.accounts?.find((a) => a.name?.toLowerCase() === 'mint')?.pubkey ||
    instruction.accounts?.[0]?.pubkey;

  const destinationAccount =
    typedData?.destination ||
    instruction.accounts?.find((a) => a.name?.toLowerCase() === 'destination')?.pubkey ||
    instruction.accounts?.[1]?.pubkey;

  const authority =
    typedData?.authority ||
    instruction.accounts?.find((a) => a.name?.toLowerCase() === 'authority')?.pubkey ||
    instruction.accounts?.[2]?.pubkey;

  // Get decimals - from typed data or args
  const decimals = typedData?.decimals ?? instruction.args?.decimals ?? 0;

  if (!mintAddress || !destinationAccount) {
    console.log('SplMintSummary: Missing mint or destination, returning null');
    return null;
  }

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        // Fetch destination account owner
        const destAccountInfo = await connection.getParsedAccountInfo(
          new PublicKey(destinationAccount)
        );
        if (destAccountInfo.value?.data && 'parsed' in destAccountInfo.value.data) {
          setDestinationOwner(destAccountInfo.value.data.parsed.info?.owner || null);
        }
      } catch (error) {
        console.warn('Failed to fetch destination account owner:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [destinationAccount, connection]);

  useEffect(() => {
    if (mintAddress) {
      getTokenMetadata(mintAddress, connection).then(setTokenMetadata).catch(console.warn);
    }
  }, [mintAddress, connection]);

  const formattedAmount = formatTokenAmount(amount, decimals);
  const tokenSymbol = tokenMetadata?.symbol || 'tokens';
  const tokenName = tokenMetadata?.name;

  return (
    <div className="space-y-3 text-sm">
      {/* Header with token info */}
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
            <span className="font-semibold text-green-600 dark:text-green-400">Mint Tokens</span>
            <span className="text-lg font-bold text-foreground">
              {formattedAmount} {tokenSymbol}
            </span>
          </div>
          {tokenName && tokenName !== tokenSymbol && (
            <div className="text-xs text-muted-foreground">{tokenName}</div>
          )}
        </div>
      </div>

      {/* Mint details */}
      <div className="space-y-2 rounded-lg border border-border/50 bg-muted/30 p-3">
        {loading ? (
          <div className="text-xs text-muted-foreground">Loading account details...</div>
        ) : (
          <>
            {/* Destination */}
            <div className="space-y-1.5">
              <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Mint To
              </div>
              <AddressWithButtons
                address={destinationOwner || destinationAccount}
                label="Recipient"
              />
            </div>

            {/* Authority */}
            {authority && (
              <div className="mt-2 border-t border-border/50 pt-2">
                <AddressWithButtons address={authority} label="Mint Authority" />
              </div>
            )}

            {/* Token mint */}
            <div className="border-t border-border/50 pt-2">
              <AddressWithButtons address={mintAddress} label="Token Mint" />
            </div>
          </>
        )}
      </div>
    </div>
  );
};
