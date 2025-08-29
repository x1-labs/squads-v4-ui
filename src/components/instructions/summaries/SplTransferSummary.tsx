import React, { useState, useEffect } from 'react';
import { PublicKey } from '@solana/web3.js';
import { InstructionSummaryProps } from '@/lib/instructions/types';
import { formatTokenAmount } from '@/lib/utils/formatters';
import { AddressWithButtons } from '@/components/AddressWithButtons';
import { getTokenMetadata, TokenMetadata } from '@/lib/token/tokenMetadata';

/**
 * Summary component for SPL Token transfers
 * Handles both Transfer and TransferChecked instructions
 */
export const SplTransferSummary: React.FC<InstructionSummaryProps> = ({
  instruction,
  connection,
}) => {
  const [tokenMetadata, setTokenMetadata] = useState<TokenMetadata | null>(null);
  const [fromOwner, setFromOwner] = useState<string | null>(null);
  const [toOwner, setToOwner] = useState<string | null>(null);
  const [loadingOwners, setLoadingOwners] = useState(true);

  const data = instruction.data as any;
  if (!data?.amount || !data?.fromTokenAccount || !data?.toTokenAccount) {
    return null;
  }

  const fromTokenAccount = data.fromTokenAccount;
  const toTokenAccount = data.toTokenAccount;
  const mintAddress = data.mint;
  const decimals = data.decimals || 0;

  useEffect(() => {
    const fetchAccountOwners = async () => {
      setLoadingOwners(true);
      try {
        // Fetch both token accounts in parallel
        const [fromAccountInfo, toAccountInfo] = await Promise.all([
          connection.getParsedAccountInfo(new PublicKey(fromTokenAccount)),
          connection.getParsedAccountInfo(new PublicKey(toTokenAccount)),
        ]);

        // Extract owners from parsed account data
        if (fromAccountInfo.value?.data && 'parsed' in fromAccountInfo.value.data) {
          setFromOwner(fromAccountInfo.value.data.parsed.info?.owner || null);
        }

        if (toAccountInfo.value?.data && 'parsed' in toAccountInfo.value.data) {
          setToOwner(toAccountInfo.value.data.parsed.info?.owner || null);
        }
      } catch (error) {
        console.warn('Failed to fetch token account owners:', error);
      } finally {
        setLoadingOwners(false);
      }
    };

    fetchAccountOwners();
  }, [fromTokenAccount, toTokenAccount, connection]);

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
            <span className="font-semibold text-blue-600 dark:text-blue-400">
              {tokenSymbol} Transfer
            </span>
            <span className="text-lg font-bold text-foreground">
              {formattedAmount} {tokenSymbol}
            </span>
          </div>
          {tokenName && tokenName !== tokenSymbol && (
            <div className="text-xs text-muted-foreground">{tokenName}</div>
          )}
        </div>
      </div>

      {/* Transfer details */}
      <div className="space-y-2 rounded-lg border border-border/50 bg-muted/30 p-3">
        {loadingOwners ? (
          <div className="text-xs text-muted-foreground">Loading account details...</div>
        ) : (
          <>
            {/* Primary transfer info - wallet owners */}
            <div className="space-y-1.5">
              <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Transfer Between Wallets
              </div>
              <AddressWithButtons address={fromOwner || fromTokenAccount} label="From" />
              <AddressWithButtons address={toOwner || toTokenAccount} label="To" />
            </div>

            {/* Token account details - only show if we have owner info */}
            {(fromOwner || toOwner) && (
              <div className="mt-2 space-y-1.5 border-t border-border/50 pt-2">
                <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Token Account Details
                </div>
                {fromOwner && <AddressWithButtons address={fromTokenAccount} label="Source" />}
                {toOwner && <AddressWithButtons address={toTokenAccount} label="Dest" />}
              </div>
            )}

            {/* Token mint */}
            {mintAddress && (
              <div className="mt-2 border-t border-border/50 pt-2">
                <AddressWithButtons address={mintAddress} label="Token Mint" />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};
