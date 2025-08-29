import React, { useState, useEffect } from 'react';
import { InstructionSummaryProps } from '../types';
import { formatTokenAmount } from '../../utils/formatters';
import { AddressWithButtons } from '../../../components/AddressWithButtons';
import { getTokenMetadata, TokenMetadata } from '../../token/tokenMetadata';

/**
 * Summary component for SPL Token transfers
 * Handles both Transfer and TransferChecked instructions
 */
export const SplTransferSummary: React.FC<InstructionSummaryProps> = ({
  instruction,
  connection,
}) => {
  const [tokenMetadata, setTokenMetadata] = useState<TokenMetadata | null>(null);

  const data = instruction.data as any;
  if (!data?.amount || !data?.fromTokenAccount || !data?.toTokenAccount) {
    return null;
  }

  const fromAddress = data.fromTokenAccount;
  const toAddress = data.toTokenAccount;
  const mintAddress = data.mint;
  const decimals = data.decimals || 0;

  useEffect(() => {
    if (mintAddress) {
      getTokenMetadata(mintAddress, connection).then(setTokenMetadata).catch(console.warn);
    }
  }, [mintAddress, connection]);

  const formattedAmount = formatTokenAmount(data.amount, decimals);
  const tokenSymbol = tokenMetadata?.symbol || 'tokens';
  const tokenName = tokenMetadata?.name;

  return (
    <div className="space-y-2 text-sm">
      <div className="flex items-center gap-2">
        {tokenMetadata?.logoURI && (
          <img
            src={tokenMetadata.logoURI}
            alt={tokenSymbol}
            className="h-6 w-6 rounded-full"
            onError={(e) => {
              e.currentTarget.style.display = 'none';
            }}
          />
        )}
        <div>
          <div className="font-semibold text-blue-600 dark:text-blue-400">Token Transfer</div>
          {tokenName && <div className="text-xs text-muted-foreground">{tokenName}</div>}
        </div>
      </div>
      <div className="space-y-1.5">
        <div className="grid grid-cols-[80px,1fr] gap-2">
          <span className="text-muted-foreground">Amount:</span>
          <span className="font-medium">
            {formattedAmount} {tokenSymbol}
          </span>
        </div>
        <AddressWithButtons address={fromAddress} label="From" />
        <AddressWithButtons address={toAddress} label="To" />
        {mintAddress && <AddressWithButtons address={mintAddress} label="Token" />}
      </div>
    </div>
  );
};
