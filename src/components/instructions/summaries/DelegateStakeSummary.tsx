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

  // Get the stake account and vote account from the instruction
  const stakeAccount = instruction.args?.stakeAccount || instruction.accounts?.[0]?.pubkey;
  const voteAccount = instruction.args?.voteAccount || instruction.accounts?.[1]?.pubkey;

  // Fetch validator metadata
  const { data: validatorMetadata } = useValidatorMetadata(voteAccount);

  useEffect(() => {
    const fetchStakeAccountBalance = async () => {
      if (!stakeAccount) return;

      try {
        const stakeAccountPubkey = new PublicKey(stakeAccount);
        const accountInfo = await connection.getAccountInfo(stakeAccountPubkey);
        if (accountInfo) {
          // Convert lamports to XNT
          setStakeAmount(formatXNT(accountInfo.lamports));
        }
      } catch (error) {
        console.error('Failed to fetch stake account balance:', error);
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
        {stakeAmount && (
          <div className="grid grid-cols-[80px,1fr] gap-2">
            <span className="text-muted-foreground">Amount:</span>
            <span className="font-medium">{stakeAmount}</span>
          </div>
        )}
        <AddressWithButtons address={stakeAccount} label="Stake Account" />
        <div className="grid grid-cols-[80px,1fr] gap-2">
          <span className="text-muted-foreground">Validator:</span>
          <ValidatorDisplay voteAccount={voteAccount} metadata={validatorMetadata} />
        </div>
      </div>
    </div>
  );
};
