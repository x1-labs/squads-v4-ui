import React from 'react';
import { InstructionSummaryProps } from '@/lib/instructions/types';
import { formatTokenAmount } from '@/lib/utils/formatters';
import { AddressWithButtons } from '@/components/AddressWithButtons';

export const StakePoolWithdrawSummary: React.FC<InstructionSummaryProps> = ({ instruction }) => {
  // Extract the pool token amount from instruction args
  const poolTokens = instruction.args?.poolTokens;

  // Extract addresses from accounts
  // For WithdrawSol, the account order is:
  // 0: stakePool, 1: withdrawAuthority, 2: transferAuthority (signer), 3: poolTokensFrom,
  // 4: reserveStake, 5: lamportsTo (destination), 6: managerFeeAccount, 7: poolMint,
  // 8: clock, 9: stakeHistory, 10: stakeProgram, 11: tokenProgram
  const fromPoolAddress = instruction.accounts?.[0]?.pubkey || 'Unknown';
  const toAddress = instruction.accounts?.[5]?.pubkey || 'Unknown';

  // Use formatTokenAmount for proper number formatting
  const amount = formatTokenAmount(poolTokens || 0, 9, 'Pool Tokens');

  return (
    <div className="space-y-2 text-sm">
      <div className="font-semibold">Stake Pool Withdraw</div>
      <div className="grid grid-cols-[80px,1fr] gap-2">
        <span className="text-muted-foreground">Amount:</span>
        <span className="font-mono font-semibold">{amount}</span>
      </div>
      <AddressWithButtons address={fromPoolAddress} label="From Pool" />
      <AddressWithButtons address={toAddress} label="To" />
    </div>
  );
};
