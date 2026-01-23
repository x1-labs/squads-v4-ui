import React, { useState, useEffect } from 'react';
import { InstructionSummaryProps } from '@/lib/instructions/types';
import { AddressWithButtons } from '@/components/AddressWithButtons';
import { getTokenMetadata, TokenMetadata } from '@/lib/token/tokenMetadata';
import { formatTokenAmount } from '@/lib/utils/formatters';

/**
 * Summary component for Warp Bridge set_token_fees instruction
 */
export const BridgeSetTokenFeesSummary: React.FC<InstructionSummaryProps> = ({
  instruction,
  connection,
}) => {
  const [tokenMetadata, setTokenMetadata] = useState<TokenMetadata | null>(null);

  const localMint = instruction.args?.local_mint;
  const flatFeeAmount = instruction.args?.flat_fee_amount;
  const percentageFeeBps = instruction.args?.percentage_fee_bps;
  const feeCollectorAta = instruction.args?.fee_collector_ata;
  const adminAddress = instruction.accounts?.[2]?.pubkey || 'Unknown';

  useEffect(() => {
    if (localMint) {
      getTokenMetadata(localMint, connection).then(setTokenMetadata).catch(console.warn);
    }
  }, [localMint, connection]);

  const tokenSymbol = tokenMetadata?.symbol || 'Token';
  const decimals = tokenMetadata?.decimals || 9;

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
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-900/30">
            <span className="text-lg">💸</span>
          </div>
        )}
        <div className="flex-1">
          <div className="font-semibold text-gray-600 dark:text-gray-400">
            Set Token Fees
          </div>
          <div className="text-xs text-muted-foreground">
            Update {tokenSymbol} fee configuration
          </div>
        </div>
      </div>

      <div className="space-y-2 rounded-lg border border-border/50 bg-muted/30 p-3">
        <AddressWithButtons address={adminAddress} label="Admin" />
        {localMint && <AddressWithButtons address={localMint} label="Token Mint" />}
        {feeCollectorAta && <AddressWithButtons address={feeCollectorAta} label="Fee Collector ATA" />}

        <div className="grid grid-cols-2 gap-2 pt-2 border-t border-border/50">
          {flatFeeAmount !== undefined && (
            <div>
              <span className="text-xs text-muted-foreground">Flat Fee:</span>
              <span className="ml-2 font-mono">{formatTokenAmount(flatFeeAmount, decimals)} {tokenSymbol}</span>
            </div>
          )}
          {percentageFeeBps !== undefined && (
            <div>
              <span className="text-xs text-muted-foreground">Fee %:</span>
              <span className="ml-2 font-mono">{(percentageFeeBps / 100).toFixed(2)}%</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
