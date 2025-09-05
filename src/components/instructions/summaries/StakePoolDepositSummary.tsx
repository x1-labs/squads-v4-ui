import React from 'react';
import { InstructionSummaryProps } from '@/lib/instructions/types';
import { formatXNT } from '@/lib/utils/formatters';
import { AddressWithButtons } from '@/components/AddressWithButtons';

export const StakePoolDepositSummary: React.FC<InstructionSummaryProps> = ({ instruction }) => {
  // Extract the amount from instruction args
  const lamports = instruction.args?.lamports;

  // Extract addresses from accounts
  // For DepositSol, the account order is:
  // 0: stakePool, 1: withdrawAuthority, 2: reserveStake, 3: fundingAccount (from),
  // 4: destinationPoolAccount, 5: managerFeeAccount, 6: referrerPoolAccount,
  // 7: poolMint, 8: systemProgram, 9: tokenProgram
  const fromAddress = instruction.accounts?.[3]?.pubkey || 'Unknown';
  const stakePoolAddress = instruction.accounts?.[0]?.pubkey || 'Unknown';

  // Use the formatXNT function which handles proper formatting with commas
  const amount = formatXNT(lamports);

  return (
    <div className="space-y-2 text-sm">
      <div className="font-semibold">Stake Pool Deposit</div>
      <div className="grid grid-cols-[80px,1fr] gap-2">
        <span className="text-muted-foreground">Amount:</span>
        <span className="font-mono font-semibold">{amount}</span>
      </div>
      <AddressWithButtons address={fromAddress} label="From" />
      <AddressWithButtons address={stakePoolAddress} label="To Pool" />
    </div>
  );
};
