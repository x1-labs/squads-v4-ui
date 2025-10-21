import React, { useEffect, useState } from 'react';
import { InstructionSummaryProps } from '@/lib/instructions/types';
import { formatXNT } from '@/lib/utils/formatters';
import { AddressWithButtons } from '@/components/AddressWithButtons';
import { PublicKey } from '@solana/web3.js';
import { useValidatorMetadata } from '@/hooks/useValidatorMetadata';
import { ValidatorDisplay } from '@/components/staking/ValidatorDisplay';

/**
 * Summary component for Stake Withdraw instructions
 */
export const WithdrawStakeSummary: React.FC<InstructionSummaryProps> = ({
  instruction,
  connection,
}) => {
  const [voteAccount, setVoteAccount] = useState<string | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(true);

  // Get the withdrawal amount and accounts from the instruction
  const lamports = instruction.args?.lamports;
  const stakeAccount = instruction.accounts?.[0]?.pubkey;
  const recipient = instruction.accounts?.[1]?.pubkey;

  // Fetch validator metadata
  const { data: validatorMetadata } = useValidatorMetadata(voteAccount);

  useEffect(() => {
    const fetchStakeAccountInfo = async () => {
      if (!stakeAccount) {
        setIsLoading(false);
        return;
      }

      try {
        const stakeAccountPubkey = new PublicKey(stakeAccount);

        // Fetch stake account info (parsed)
        const accountInfo = await connection.getParsedAccountInfo(stakeAccountPubkey);
        if (accountInfo.value) {
          // Get validator from parsed data
          const parsedData = accountInfo.value.data as any;
          if (parsedData?.parsed?.info?.stake?.delegation?.voter) {
            setVoteAccount(parsedData.parsed.info.stake.delegation.voter);
          }
        }
      } catch (error) {
        console.error('Failed to fetch stake account info:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchStakeAccountInfo();
  }, [stakeAccount, connection]);

  if (!lamports || !stakeAccount) {
    return null;
  }

  return (
    <div className="space-y-2 text-sm">
      <div className="font-semibold text-blue-600 dark:text-blue-400">Withdraw Stake</div>
      <div className="space-y-1.5">
        <div className="grid grid-cols-[80px,1fr] gap-2">
          <span className="text-muted-foreground">Amount:</span>
          <span className="font-medium">{formatXNT(lamports)}</span>
        </div>
        <AddressWithButtons address={stakeAccount} label="Stake Account" />
        {voteAccount && !isLoading && (
          <div className="grid grid-cols-[80px,1fr] gap-2">
            <span className="text-muted-foreground">Validator:</span>
            <ValidatorDisplay voteAccount={voteAccount} metadata={validatorMetadata} />
          </div>
        )}
        {recipient && <AddressWithButtons address={recipient} label="To" />}
      </div>
    </div>
  );
};
