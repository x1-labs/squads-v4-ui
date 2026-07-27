/**
 * Value helpers for Anchor-decoded instruction data, shared by every program's
 * instruction summaries.
 *
 * Anchor's coders hand back BN instances for u64/i64 fields and
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
