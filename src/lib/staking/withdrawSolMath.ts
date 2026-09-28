/**
 * Exact integer math for the stake pool's WithdrawSol instruction.
 *
 * Pool token amounts routinely exceed 2^53 raw units (244M tokens at 9 decimals
 * is ~2.4e17), so JS numbers silently round them. Everything here is bigint, and
 * the quote mirrors the on-chain program so the dialog can show what the vault
 * will actually receive and cap the amount at what the reserve can pay out.
 */

export interface WithdrawSolPoolState {
  totalLamports: bigint;
  poolTokenSupply: bigint;
  solWithdrawalFee: { numerator: bigint; denominator: bigint };
}

/**
 * Parse a user-typed decimal string into raw token units without going through
 * a float. Returns null for anything that isn't a plain non-negative decimal or
 * that has more fractional digits than the mint supports.
 */
export function parseTokenAmount(input: string, decimals: number): bigint | null {
  const trimmed = input.trim();
  if (!/^\d*\.?\d*$/.test(trimmed) || trimmed === '' || trimmed === '.') {
    return null;
  }
  const [whole = '', fraction = ''] = trimmed.split('.');
  if (fraction.length > decimals) {
    return null;
  }
  return BigInt((whole || '0') + fraction.padEnd(decimals, '0'));
}

/** Render raw token units as an exact decimal string, trailing zeros trimmed. */
export function formatTokenAmount(raw: bigint, decimals: number): string {
  const digits = raw.toString().padStart(decimals + 1, '0');
  const whole = digits.slice(0, digits.length - decimals);
  const fraction = digits.slice(digits.length - decimals).replace(/0+$/, '');
  return fraction ? `${whole}.${fraction}` : whole;
}

/** The program's Fee::apply: rounds the fee up. */
function applyFee(amount: bigint, fee: WithdrawSolPoolState['solWithdrawalFee']): bigint {
  if (fee.denominator === 0n) {
    return 0n;
  }
  return (amount * fee.numerator + fee.denominator - 1n) / fee.denominator;
}

/** The program's calc_lamports_withdraw_amount: rounds down, 0 on an empty pool. */
function lamportsForPoolTokens(pool: WithdrawSolPoolState, poolTokens: bigint): bigint {
  const numerator = poolTokens * pool.totalLamports;
  if (pool.poolTokenSupply === 0n || numerator < pool.poolTokenSupply) {
    return 0n;
  }
  return numerator / pool.poolTokenSupply;
}

/**
 * What burning `poolTokens` pays out. The fee is waived when the tokens are
 * burned from the pool's own manager fee account.
 */
export function quoteWithdrawSol(
  pool: WithdrawSolPoolState,
  poolTokens: bigint,
  feeWaived: boolean
): { lamports: bigint; feePoolTokens: bigint } {
  const feePoolTokens = feeWaived ? 0n : applyFee(poolTokens, pool.solWithdrawalFee);
  return { lamports: lamportsForPoolTokens(pool, poolTokens - feePoolTokens), feePoolTokens };
}

/**
 * Lamports the reserve can pay out. The program keeps the reserve's rent-exempt
 * minimum (observed on X1 as rentExemptReserve - 1); holding back
 * rentExemptReserve + 1 stays safely under that.
 */
export function maxReserveWithdrawLamports(
  reserveLamports: bigint,
  rentExemptReserve: bigint
): bigint {
  const available = reserveLamports - rentExemptReserve - 1n;
  return available > 0n ? available : 0n;
}

/** Largest pool-token amount whose payout fits within `maxLamports`. */
export function maxPoolTokensForLamports(
  pool: WithdrawSolPoolState,
  maxLamports: bigint,
  feeWaived: boolean
): bigint {
  if (pool.totalLamports === 0n) {
    return 0n;
  }
  // Largest burn with burn * totalLamports / supply <= maxLamports.
  const maxBurnt = ((maxLamports + 1n) * pool.poolTokenSupply - 1n) / pool.totalLamports;
  const burnt = (tokens: bigint) =>
    tokens - (feeWaived ? 0n : applyFee(tokens, pool.solWithdrawalFee));

  const { numerator, denominator } = pool.solWithdrawalFee;
  if (feeWaived || denominator === 0n || numerator === 0n) {
    return maxBurnt;
  }
  if (numerator >= denominator) {
    // A 100% fee leaves nothing to pay out; the program rejects it as too small.
    return 0n;
  }
  // Invert the fee, then step to the exact boundary (the fee's ceiling rounding
  // moves it by at most a unit or two).
  let tokens = (maxBurnt * denominator) / (denominator - numerator);
  while (burnt(tokens + 1n) <= maxBurnt) tokens += 1n;
  while (tokens > 0n && burnt(tokens) > maxBurnt) tokens -= 1n;
  return tokens;
}
