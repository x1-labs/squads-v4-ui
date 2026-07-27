/**
 * Value helpers for delegation program instruction data.
 *
 * Anchor's BorshInstructionCoder hands back BN instances for u64 fields and
 * `{ variantName: {} }` objects for enums, so summaries need a small amount of
 * normalization before anything can be displayed or compared.
 */

/**
 * Coerce a decoded numeric arg (BN, string, number, bigint) to a bigint.
 * Returns null when the value is absent or not numeric.
 */
export function toBigInt(value: unknown): bigint | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'bigint') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? BigInt(value) : null;

  // BN and other objects expose a base-10 toString()
  const asString = typeof value === 'string' ? value : String(value);
  return /^-?\d+$/.test(asString) ? BigInt(asString) : null;
}

/**
 * Coerce a decoded numeric arg to a JS number. Safe for the u8/u16/u32 fields
 * the delegation program uses; returns null for anything non-numeric.
 */
export function toNumber(value: unknown): number | null {
  const big = toBigInt(value);
  return big === null ? null : Number(big);
}

/**
 * Extract the variant name from an Anchor enum value (`{ approved: {} }`).
 * Anchor lowercases the first letter, so the raw key is title-cased back.
 */
export function enumVariantName(value: unknown): string | null {
  if (typeof value === 'string') return value;
  if (!value || typeof value !== 'object') return null;

  const [variant] = Object.keys(value as Record<string, unknown>);
  if (!variant) return null;

  return variant.charAt(0).toUpperCase() + variant.slice(1);
}

/**
 * Render a validator version packed by the program as
 * `major * 1_000_000 + minor * 1_000 + patch`.
 */
export function formatValidatorVersion(packed: number | null | undefined): string {
  if (packed === null || packed === undefined || !Number.isFinite(packed)) return '—';

  const major = Math.floor(packed / 1_000_000);
  const minor = Math.floor(packed / 1_000) % 1_000;
  const patch = packed % 1_000;

  return `${major}.${minor}.${patch}`;
}

/**
 * Format a basis-points stake multiplier (10000 bps = 100%).
 */
export function formatBasisPoints(bps: number | null | undefined): string {
  if (bps === null || bps === undefined || !Number.isFinite(bps)) return '—';
  return `${(bps / 100).toLocaleString(undefined, { maximumFractionDigits: 2 })}%`;
}

/**
 * Percentage change between two values, for annotating a before -> after pair.
 * Returns null when there is no meaningful baseline to compare against.
 */
export function percentChange(from: bigint, to: bigint): number | null {
  if (from === BigInt(0)) return null;

  const delta = Number(to - from);
  const base = Math.abs(Number(from));
  if (!Number.isFinite(delta) || !Number.isFinite(base) || base === 0) return null;

  return (delta / base) * 100;
}

/**
 * Human labels for the `DelegationCriterion` enum, plus what failing the
 * criterion means for the validator.
 */
export const DELEGATION_CRITERIA: Record<string, { label: string; description: string }> = {
  MaxCommission: {
    label: 'Commission too high',
    description: 'Commission exceeds the configured maximum',
  },
  MinSelfStake: {
    label: 'Self-stake too low',
    description: 'Validator self-stake is below the required minimum',
  },
  MaxTotalStake: {
    label: 'Total stake too high',
    description: 'Validator holds more stake than the per-validator cap',
  },
  MinVoteCredits: {
    label: 'Vote credits too low',
    description: 'Vote credits are below the threshold vs. the cluster average',
  },
  MaxSkipRate: {
    label: 'Skip rate too high',
    description: 'Skip rate exceeds the tolerance above the cluster average',
  },
  MinValidatorVersion: {
    label: 'Version too old',
    description: 'Validator is running below the minimum required version',
  },
  Delinquent: {
    label: 'Delinquent',
    description: 'Validator is not voting',
  },
  NoVersionInfo: {
    label: 'No version reported',
    description: 'Validator does not report a version over gossip',
  },
  NotValidator: {
    label: 'Not an active validator',
    description: 'Vote account is not part of the active validator set',
  },
  MaxTotalStakePercent: {
    label: 'Network share too high',
    description: 'Validator controls more than the allowed share of network stake',
  },
};

/**
 * Human labels for the `ValidatorStatus` enum.
 */
export const VALIDATOR_STATUSES: Record<string, { label: string; description: string }> = {
  Pending: {
    label: 'Pending',
    description: 'Awaiting review — not yet eligible for delegation',
  },
  Approved: {
    label: 'Approved',
    description: 'Eligible to receive stake from the delegation program',
  },
  Rejected: {
    label: 'Rejected',
    description: 'Not eligible to receive stake from the delegation program',
  },
};
