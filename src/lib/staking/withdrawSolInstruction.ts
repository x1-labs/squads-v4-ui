import { PublicKey, TransactionInstruction } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { StakePoolInstruction, type WithdrawSolParams } from '@x1-labs/spl-stake-pool';

/**
 * StakePoolInstruction.withdrawSol with two library gaps closed:
 * - it encodes poolTokens from a JS number, which rounds anything above 2^53 raw
 *   units, so the amount is written here as an exact u64;
 * - it always passes the classic token program, which a Token-2022 pool rejects,
 *   so the pool's own token program is swapped in.
 */
export function createWithdrawSolInstruction(
  params: Omit<WithdrawSolParams, 'poolTokens'> & {
    poolTokens: bigint;
    tokenProgramId: PublicKey;
  }
): TransactionInstruction {
  const { poolTokens, tokenProgramId, ...rest } = params;
  const ix = StakePoolInstruction.withdrawSol({ ...rest, poolTokens: 0 });

  const data = Buffer.from(ix.data);
  data.writeBigUInt64LE(poolTokens, 1);
  ix.data = data;

  const tokenProgramIndex = ix.keys.findIndex((k) => k.pubkey.equals(TOKEN_PROGRAM_ID));
  if (tokenProgramIndex === -1) {
    throw new Error('withdrawSol layout changed: token program account not found');
  }
  ix.keys[tokenProgramIndex] = { ...ix.keys[tokenProgramIndex], pubkey: tokenProgramId };
  return ix;
}

/**
 * Turn a simulated WithdrawSol revert into an actionable message. The generic
 * vault describer reads any "insufficient" as a stake-cooldown problem, which
 * says nothing useful about a pool withdrawal.
 */
export function describeWithdrawSolSimulationError(result: {
  error: string;
  logs?: string[];
}): string {
  const haystack = `${result.error} ${(result.logs || []).join(' ')}`.toLowerCase();
  if (haystack.includes('insufficientfundsforfee') || haystack.includes('funds for fee')) {
    return 'Simulation failed: the connected wallet does not have enough to cover the transaction fee. Fund the wallet and try again.';
  }
  if (haystack.includes('maximum possible sol withdrawal') || haystack.includes('too much sol')) {
    return "Simulation failed: the pool's reserve can't pay out this much right now. Lower the amount; Max shows what the reserve can cover.";
  }
  if (haystack.includes('insufficient funds')) {
    return 'Simulation failed: the vault does not hold that many pool tokens.';
  }
  return `Simulation failed before signing: ${result.error}. Nothing was submitted.`;
}
