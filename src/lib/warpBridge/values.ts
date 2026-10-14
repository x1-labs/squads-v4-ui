/**
 * Value helpers for warp bridge instruction data and account state.
 *
 * Anchor hands back BN instances for u64/i64 fields, `{ variantName: {} }` for
 * enums, and byte arrays for fixed-size fields like the token symbol.
 */
import { PublicKey } from '@solana/web3.js';

export { toBigInt, toNumber, enumVariantName, percentChange } from '../utils/anchorValues';

import { toBigInt, toNumber, enumVariantName } from '../utils/anchorValues';

/** Basis points as a percentage: 30 bps -> "0.30%". */
export function formatBps(bps: unknown): string {
  const n = toNumber(bps);
  if (n === null) return '—';
  return `${(n / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
}

/**
 * Decode the registry's fixed 12-byte symbol field. Anchor returns it as a
 * number array; trailing zero padding is stripped.
 */
export function decodeSymbol(value: unknown): string | null {
  if (typeof value === 'string') return value || null;
  if (!Array.isArray(value)) return null;

  const bytes = value.filter((byte) => typeof byte === 'number' && byte !== 0);
  if (!bytes.length) return null;

  return String.fromCharCode(...bytes).trim() || null;
}

/**
 * A 32-byte counterparty address. Both sides of this bridge are Solana-style
 * chains, so the bytes are a pubkey.
 */
export function formatCounterparty(value: unknown): string | null {
  if (typeof value === 'string') return value;
  if (!Array.isArray(value) || value.length !== 32) return null;

  try {
    return new PublicKey(Uint8Array.from(value)).toBase58();
  } catch {
    return null;
  }
}

/** Format a token amount using the registry's decimals. */
export function formatTokenUnits(
  amount: unknown,
  decimals: number | null,
  symbol?: string | null
): string {
  const raw = toBigInt(amount);
  if (raw === null) return '—';

  const suffix = symbol ? ` ${symbol}` : '';
  if (decimals === null || decimals <= 0) return `${raw.toLocaleString()}${suffix}`;

  // Built by repeated multiplication: the ** operator needs an ES2016+ target.
  let divisor = BigInt(1);
  for (let i = 0; i < decimals; i++) divisor *= BigInt(10);

  const whole = raw / divisor;
  const fraction = (raw % divisor).toString().padStart(decimals, '0').replace(/0+$/, '');

  return fraction
    ? `${whole.toLocaleString()}.${fraction.slice(0, 4)}${suffix}`
    : `${whole.toLocaleString()}${suffix}`;
}

/**
 * A limit field where 0 means "no limit" — the registry uses this convention
 * for daily cap, min/max amount and the whale threshold.
 */
export function formatLimit(
  amount: unknown,
  decimals: number | null,
  symbol?: string | null,
  noLimitLabel = 'No limit'
): string {
  const raw = toBigInt(amount);
  if (raw === null) return '—';
  if (raw === BigInt(0)) return noLimitLabel;
  return formatTokenUnits(amount, decimals, symbol);
}

/** Human duration for the whale delay, which is stored in seconds. */
export function formatDuration(seconds: unknown): string {
  const total = toNumber(seconds);
  if (total === null) return '—';
  if (total === 0) return 'No delay';

  const abs = Math.abs(total);
  if (abs >= 86400)
    return `${(abs / 86400).toLocaleString(undefined, { maximumFractionDigits: 1 })} days`;
  if (abs >= 3600)
    return `${(abs / 3600).toLocaleString(undefined, { maximumFractionDigits: 1 })} hours`;
  if (abs >= 60)
    return `${(abs / 60).toLocaleString(undefined, { maximumFractionDigits: 1 })} minutes`;
  return `${abs} seconds`;
}

/**
 * Chains this bridge deployment can be configured as. The program validates
 * sequence-number encoding against this ID, so a wrong value breaks transfers
 * in both directions.
 */
export const CHAIN_NAMES: Record<number, string> = {
  0: 'Solana',
  1: 'X1',
};

export function formatChainId(chainId: unknown): string {
  const n = toNumber(chainId);
  if (n === null) return '—';
  return `${CHAIN_NAMES[n] ?? 'Unknown chain'} (${n})`;
}

/** Human labels for the `PauseReason` enum. */
export const PAUSE_REASONS: Record<string, string> = {
  None: 'No reason recorded',
  Manual: 'Manual pause',
  AnomalyDetected: 'Anomaly detected',
  FrequencySpike: 'Transfer frequency spike',
  VolumeSpike: 'Transfer volume spike',
  LargeTransfer: 'Unusually large transfer',
  EmergencyHalt: 'Emergency halt',
  Other: 'Other',
};

export function formatPauseReason(value: unknown): string {
  const variant = enumVariantName(value);
  if (!variant) return '—';

  const label = PAUSE_REASONS[variant] ?? variant;
  // `Other` carries a numeric code alongside the variant.
  const code =
    value && typeof value === 'object'
      ? (Object.values(value as Record<string, any>)[0]?.code ?? null)
      : null;

  return code !== null && code !== undefined ? `${label} (code ${code})` : label;
}

/**
 * Human labels for the `RoleType` enum, with what each role may do and the
 * field it maps to on the `Roles` account.
 */
export const ROLE_TYPES: Record<
  string,
  {
    label: string;
    description: string;
    field: 'pauser' | 'fee_manager' | 'registrar' | 'operations_admin';
  }
> = {
  Pauser: {
    label: 'Pauser',
    description: 'May pause and unpause the bridge without full admin rights',
    field: 'pauser',
  },
  FeeManager: {
    label: 'Fee manager',
    description: 'May adjust bridge fee parameters',
    field: 'fee_manager',
  },
  Registrar: {
    label: 'Registrar',
    description: 'May register new tokens for bridging',
    field: 'registrar',
  },
  OperationsAdmin: {
    label: 'Operations admin',
    description:
      'May pause and resume tokens, set token limits, change manual review and release held transfers; cannot run incident recovery',
    field: 'operations_admin',
  },
};

export function describeRole(value: unknown): {
  label: string;
  description?: string;
  field?: 'pauser' | 'fee_manager' | 'registrar' | 'operations_admin';
} {
  const variant = enumVariantName(value);
  if (!variant) return { label: 'Unknown role' };
  return ROLE_TYPES[variant] ?? { label: variant };
}

/**
 * Human labels for the `RecoveryMode` enum. The mode is ordered: each step
 * enables more of the incident-recovery surface.
 */
export const RECOVERY_MODES: Record<string, { label: string; description: string }> = {
  Disabled: {
    label: 'Disabled',
    description: 'No cancellations or reversals can be executed',
  },
  CancellationOnly: {
    label: 'Cancellation only',
    description:
      'Root may tombstone undelivered inbound transfers on this chain; source-side reversals stay blocked',
  },
  FullRecovery: {
    label: 'Full recovery',
    description:
      'Root may cancel inbound transfers and reverse cancelled outbound transfers back to their senders',
  },
};

export function describeRecoveryMode(value: unknown): { label: string; description?: string } {
  const variant = enumVariantName(value);
  if (!variant) return { label: '—' };
  return RECOVERY_MODES[variant] ?? { label: variant };
}

/** A 32-byte identifier (incident ID, message hash) as lowercase hex. */
export function formatBytes32(value: unknown): string | null {
  if (!Array.isArray(value) && !(value instanceof Uint8Array)) return null;
  const bytes = Array.from(value as ArrayLike<number>);
  if (bytes.length !== 32 || bytes.some((byte) => typeof byte !== 'number')) return null;
  return bytes.map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** A unix timestamp in seconds as an ISO-8601 UTC string. */
export function formatUnixTime(seconds: unknown): string {
  const n = toNumber(seconds);
  if (n === null) return '—';
  if (n === 0) return 'Not set';
  const date = new Date(n * 1000);
  return Number.isNaN(date.getTime()) ? String(n) : date.toISOString().replace('.000Z', 'Z');
}

/**
 * Decode the route a bridge sequence number encodes. Current sequences carry
 * the source and destination chain IDs in their top byte as
 * `(source << 4) | dest`; legacy sequences are slot-based and carry no route.
 */
export function describeSequenceRoute(seq: unknown): string | null {
  const value = toBigInt(seq);
  if (value === null) return null;
  const route = Number(value >> BigInt(56));
  if (route === 0) return null;
  const source = CHAIN_NAMES[route >> 4];
  const dest = CHAIN_NAMES[route & 0x0f];
  return source && dest ? `${source} → ${dest}` : null;
}
