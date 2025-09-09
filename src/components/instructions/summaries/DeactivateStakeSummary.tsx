import React, { useEffect, useState } from 'react';
import { InstructionSummaryProps } from '@/lib/instructions/types';
import { formatXNT } from '@/lib/utils/formatters';
import { AddressWithButtons } from '@/components/AddressWithButtons';
import { PublicKey } from '@solana/web3.js';
import { useValidatorMetadata } from '@/hooks/useValidatorMetadata';
import { ValidatorDisplay } from '@/components/staking/ValidatorDisplay';

/**
 * Summary component for Stake Deactivate instructions
 */
export const DeactivateStakeSummary: React.FC<InstructionSummaryProps> = ({
  instruction,
  connection,
}) => {
  const [stakeAmount, setStakeAmount] = useState<string | null>(null);
  const [voteAccount, setVoteAccount] = useState<string | undefined>(undefined);

  // Get the stake account from the instruction
  const stakeAccount = instruction.args?.stakeAccount || instruction.accounts?.[0]?.pubkey;

  // Fetch validator metadata
  const { data: validatorMetadata } = useValidatorMetadata(voteAccount);

  useEffect(() => {
    const fetchStakeAccountInfo = async () => {
      if (!stakeAccount) return;

      try {
        const stakeAccountPubkey = new PublicKey(stakeAccount);

        // Fetch stake account info (parsed)
        const accountInfo = await connection.getParsedAccountInfo(stakeAccountPubkey);
        if (accountInfo.value) {
          // Get balance
          setStakeAmount(formatXNT(accountInfo.value.lamports));

          // Get validator from parsed data
          const parsedData = accountInfo.value.data as any;
          if (parsedData?.parsed?.info?.stake?.delegation?.voter) {
            setVoteAccount(parsedData.parsed.info.stake.delegation.voter);
          }
        }
      } catch (error) {
        console.error('Failed to fetch stake account info:', error);
      }
    };

    fetchStakeAccountInfo();
  }, [stakeAccount, connection]);

  if (!stakeAccount) {
    return null;
  }

  return (
    <div className="space-y-2 text-sm">
      <div className="font-semibold text-orange-600 dark:text-orange-400">Deactivate Stake</div>
      <div className="space-y-1.5">
        {stakeAmount && (
          <div className="grid grid-cols-[80px,1fr] gap-2">
            <span className="text-muted-foreground">Amount:</span>
            <span className="font-medium">{stakeAmount}</span>
          </div>
        )}
        <AddressWithButtons address={stakeAccount} label="Stake Account" />
        {voteAccount && (
          <div className="grid grid-cols-[80px,1fr] gap-2">
            <span className="text-muted-foreground">Validator:</span>
            <ValidatorDisplay voteAccount={voteAccount} metadata={validatorMetadata} />
          </div>
        )}
      </div>
    </div>
  );
};
