import { ComputeBudgetProgram } from '@solana/web3.js';
import type { Connection, PublicKey, TransactionInstruction } from '@solana/web3.js';

/**
 * Priority fee floor, in micro-lamports per compute unit.
 *
 * Solana's fee market is quiet most of the time — `getRecentPrioritizationFees`
 * routinely reports 0 for every sampled slot — but a zero-fee transaction is the
 * first thing dropped when a slot does fill up. A small floor costs a fraction of
 * a cent at realistic compute budgets and buys a place in the queue ahead of the
 * genuinely unpriced traffic.
 */
const FEE_FLOOR_MICRO_LAMPORTS = 1_000;

/**
 * Ceiling, so a single congested account in the sample can't turn a proposal
 * approval into a visibly expensive transaction. At the ~50k CU these actions
 * consume this caps the priority portion at 0.005 SOL.
 */
const FEE_CEILING_MICRO_LAMPORTS = 100_000;

/** Percentile of the recent-fee sample to bid. High enough to beat the median slot. */
const FEE_PERCENTILE = 0.75;

/**
 * Compute-unit headroom over what simulation actually consumed.
 *
 * The budget instructions are added *after* the simulation that measures usage,
 * so the limit has to cover both the measured work and the two ComputeBudget
 * instructions themselves (150 CU each).
 */
const CU_MARGIN = 1.2;
const CU_BUDGET_INSTRUCTION_OVERHEAD = 600;

/** Fallback when simulation didn't report usage. Comfortably above any proposal action. */
const CU_FALLBACK = 200_000;

/**
 * What the runtime grants a transaction that requests no limit: 200k CU per
 * non-budget instruction, capped at 1.4M. A batch that ran fine without a
 * budget instruction was running on this, so it is the right fallback when a
 * measurement is unavailable — a flat 200k would cut a five-instruction batch
 * to a fifth of what it had.
 */
const CU_RUNTIME_DEFAULT_PER_INSTRUCTION = 200_000;
const CU_RUNTIME_MAX = 1_400_000;

export function runtimeDefaultComputeUnits(instructionCount: number): number {
  return Math.min(
    CU_RUNTIME_DEFAULT_PER_INSTRUCTION * Math.max(1, instructionCount),
    CU_RUNTIME_MAX
  );
}

/**
 * Bid the 75th percentile of what recently landed against these accounts.
 *
 * `getRecentPrioritizationFees` reports, per slot, the lowest priority fee among
 * transactions that wrote to the given accounts — so it describes the going rate
 * for contending with *this* proposal's writes specifically, not the chain as a
 * whole. Failure is never fatal: a fee lookup that errors or rate-limits must not
 * block an approval, so we fall back to the floor.
 */
export async function getPriorityFeeMicroLamports(
  connection: Connection,
  writableAccounts: PublicKey[]
): Promise<number> {
  try {
    const response = await connection.getRecentPrioritizationFees({
      // The RPC caps this list at 128 accounts.
      lockedWritableAccounts: writableAccounts.slice(0, 128),
    });

    if (!response.length) return FEE_FLOOR_MICRO_LAMPORTS;

    const fees = response.map((sample) => sample.prioritizationFee).sort((a, b) => a - b);
    const percentileFee = fees[Math.min(fees.length - 1, Math.floor(fees.length * FEE_PERCENTILE))];

    return Math.min(FEE_CEILING_MICRO_LAMPORTS, Math.max(FEE_FLOOR_MICRO_LAMPORTS, percentileFee));
  } catch (error) {
    console.warn('[priorityFee] Falling back to floor, fee lookup failed:', error);
    return FEE_FLOOR_MICRO_LAMPORTS;
  }
}

/**
 * Compute-unit limit to request for work that simulation measured at
 * `unitsConsumed`. Returns the fallback when there is no measurement, and never
 * less than `minUnits` so a caller can let the user raise the floor.
 */
export function sizeComputeUnitLimit(unitsConsumed?: number | null, minUnits = 0): number {
  const sized = unitsConsumed
    ? Math.ceil(unitsConsumed * CU_MARGIN) + CU_BUDGET_INSTRUCTION_OVERHEAD
    : CU_FALLBACK;
  return Math.max(minUnits, sized);
}

/**
 * The two ComputeBudget instructions, always together: the priority fee is
 * `price × limit`, so setting a price without a limit bids against the default
 * request (200k CU per instruction) and overpays several-fold for work that
 * actually costs ~50k.
 *
 * `microLamports` must be a non-negative integer — web3.js converts it with
 * `BigInt()`, which throws on fractions and NaN.
 */
export function computeBudgetInstructions(params: {
  units: number;
  microLamports: number;
}): TransactionInstruction[] {
  return [
    ComputeBudgetProgram.setComputeUnitLimit({ units: params.units }),
    ComputeBudgetProgram.setComputeUnitPrice({ microLamports: params.microLamports }),
  ];
}
