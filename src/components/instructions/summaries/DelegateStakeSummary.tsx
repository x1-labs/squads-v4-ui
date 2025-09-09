import React, { useEffect, useState } from 'react';
import { InstructionSummaryProps } from '@/lib/instructions/types';
import { formatXNT } from '@/lib/utils/formatters';
import { AddressWithButtons } from '@/components/AddressWithButtons';
import { PublicKey } from '@solana/web3.js';
import { useValidatorMetadata } from '@/hooks/useValidatorMetadata';
import { ValidatorDisplay } from '@/components/staking/ValidatorDisplay';

/**
 * Summary component for Stake Delegate instructions
 */
export const DelegateStakeSummary: React.FC<InstructionSummaryProps> = ({
  instruction,
  connection,
}) => {
  const [stakeAmount, setStakeAmount] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Get the stake account and vote account from the instruction
  const stakeAccount = instruction.args?.stakeAccount || instruction.accounts?.[0]?.pubkey;
  const voteAccount = instruction.args?.voteAccount || instruction.accounts?.[1]?.pubkey;

  // Fetch validator metadata
  const { data: validatorMetadata } = useValidatorMetadata(voteAccount);

  useEffect(() => {
    const fetchStakeAccountBalance = async () => {
      if (!stakeAccount) {
        setIsLoading(false);
        return;
      }

      try {
        const stakeAccountPubkey = new PublicKey(stakeAccount);
        const accountInfo = await connection.getAccountInfo(stakeAccountPubkey);
        if (accountInfo) {
          // Convert lamports to XNT
          setStakeAmount(formatXNT(accountInfo.lamports));
        } else {
          // Account doesn't exist yet, might be created in this transaction
          // Try to get parsed account info to see if it's a new account
          const parsedInfo = await connection.getParsedAccountInfo(stakeAccountPubkey);
          if (parsedInfo.value) {
            setStakeAmount(formatXNT(parsedInfo.value.lamports));
          } else {
            // If account doesn't exist, it's likely being created in this transaction
            // We can't determine the amount without looking at other instructions
            console.debug('Stake account not found on chain, may be created in this transaction');
            setStakeAmount(null);
          }
        }
      } catch (error) {
        console.error('Failed to fetch stake account balance:', error);
        setStakeAmount(null);
      } finally {
        setIsLoading(false);
      }
    };

    fetchStakeAccountBalance();
  }, [stakeAccount, connection]);

  if (!stakeAccount || !voteAccount) {
    return null;
  }

  return (
    <div className="space-y-2 text-sm">
      <div className="font-semibold text-green-600 dark:text-green-400">Delegate Stake</div>
      <div className="space-y-1.5">
        <div className="grid grid-cols-[80px,1fr] gap-2">
          <span className="text-muted-foreground">Amount:</span>
          {isLoading ? (
            <span className="text-xs text-muted-foreground">Loading...</span>
          ) : stakeAmount ? (
            <span className="font-medium">{stakeAmount}</span>
          ) : (
            <span className="text-xs text-muted-foreground">
              See Create Account instruction above
            </span>
          )}
        </div>
        <AddressWithButtons address={stakeAccount} label="Stake Account" />
        <div className="grid grid-cols-[80px,1fr] gap-2">
          <span className="text-muted-foreground">Validator:</span>
          <ValidatorDisplay voteAccount={voteAccount} metadata={validatorMetadata} />
        </div>
      </div>
    </div>
  );
};
