import React, { useState, useEffect } from 'react';
import { PublicKey } from '@solana/web3.js';
import { InstructionSummaryProps } from '@/lib/instructions/types';
import { formatTokenAmount } from '@/lib/utils/formatters';
import { AddressWithButtons } from '@/components/AddressWithButtons';
import { getTokenMetadata, TokenMetadata } from '@/lib/token/tokenMetadata';
import { BurnData } from '@/lib/transaction/instructionTypes';

/**
 * Summary component for SPL Token Burn and BurnChecked instructions
 */
export const SplBurnSummary: React.FC<InstructionSummaryProps> = ({ instruction, connection }) => {
  const [tokenMetadata, setTokenMetadata] = useState<TokenMetadata | null>(null);
  const [accountOwner, setAccountOwner] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const data = instruction.data as BurnData | undefined;
  if (!data?.amount || !data?.account) {
    return null;
  }

  const tokenAccount = data.account;
  const mintAddress = data.mint;
  const authority = data.authority;
  const decimals = data.decimals || 0;

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        // Fetch token account owner
        const accountInfo = await connection.getParsedAccountInfo(new PublicKey(tokenAccount));
        if (accountInfo.value?.data && 'parsed' in accountInfo.value.data) {
          setAccountOwner(accountInfo.value.data.parsed.info?.owner || null);
        }
      } catch (error) {
        console.warn('Failed to fetch token account owner:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [tokenAccount, connection]);

  useEffect(() => {
    if (mintAddress) {
      getTokenMetadata(mintAddress, connection).then(setTokenMetadata).catch(console.warn);
    }
  }, [mintAddress, connection]);

  const formattedAmount = formatTokenAmount(data.amount, decimals);
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
            <span className="font-semibold text-red-600 dark:text-red-400">Burn Tokens</span>
            <span className="text-lg font-bold text-foreground">
              {formattedAmount} {tokenSymbol}
            </span>
          </div>
          {tokenName && tokenName !== tokenSymbol && (
            <div className="text-xs text-muted-foreground">{tokenName}</div>
          )}
        </div>
      </div>

      {/* Burn details */}
      <div className="space-y-2 rounded-lg border border-border/50 bg-muted/30 p-3">
        {loading ? (
          <div className="text-xs text-muted-foreground">Loading account details...</div>
        ) : (
          <>
            {/* Source account */}
            <div className="space-y-1.5">
              <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Burn From
              </div>
              <AddressWithButtons address={accountOwner || tokenAccount} label="Token Holder" />
            </div>

            {/* Authority */}
            <div className="mt-2 border-t border-border/50 pt-2">
              <AddressWithButtons address={authority} label="Authority" />
            </div>

            {/* Token mint */}
            {mintAddress && (
              <div className="border-t border-border/50 pt-2">
                <AddressWithButtons address={mintAddress} label="Token Mint" />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};
