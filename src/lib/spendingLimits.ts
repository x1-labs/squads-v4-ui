import { PublicKey } from '@solana/web3.js';
import * as multisig from '@sqds/multisig';

/** The program uses the default pubkey as the mint of a native-token (XNT/SOL) limit. */
export const NATIVE_MINT_KEY = PublicKey.default;

/** spending_limit_use requires `decimals == 9` for the native token. */
export const NATIVE_DECIMALS = 9;

const U64_MAX = (1n << 64n) - 1n;

const Period = multisig.types.Period;
type Period = multisig.types.Period;

/** Period lengths from Period::to_seconds (state/spending_limit.rs). Month is 30 days. */
export const PERIOD_SECONDS: Record<Period, number | null> = {
  [Period.OneTime]: null,
  [Period.Day]: 24 * 60 * 60,
  [Period.Week]: 7 * 24 * 60 * 60,
  [Period.Month]: 30 * 24 * 60 * 60,
};

export const PERIOD_LABELS: Record<Period, string> = {
  [Period.OneTime]: 'One time',
  [Period.Day]: 'Daily',
  [Period.Week]: 'Weekly (7 days)',
  [Period.Month]: 'Monthly (30 days)',
};

export function isNativeMint(mint: PublicKey): boolean {
  return mint.equals(NATIVE_MINT_KEY);
}

/**
 * Converts an amount in token units ("1.5") to base units with the mint
 * decimals. Uses string math, so u64 values keep full precision.
 */
export function parseTokenAmount(
  value: string,
  decimals: number
): { amount: bigint } | { error: string } {
  const trimmed = value.trim();
  const match = /^(\d+)(?:\.(\d+))?$/.exec(trimmed);
  if (!match) {
    return { error: 'Enter a number greater than zero.' };
  }
  const [, whole, fraction = ''] = match;
  if (fraction.length > decimals) {
    return {
      error:
        decimals === 0
          ? 'This token has no decimals. Enter a whole number.'
          : `Enter at most ${decimals} decimal places.`,
    };
  }
  const amount = BigInt(whole + fraction.padEnd(decimals, '0'));
  if (amount === 0n) {
    return { error: 'Enter a number greater than zero.' };
  }
  if (amount > U64_MAX) {
    return { error: 'The amount is too large.' };
  }
  return { amount };
}

/** A u64 or i64 as the SDK returns it (number or BN), or as a bigint or string. */
type IntLike = bigint | number | string | { toString(): string };

export type SpendingLimitTiming = {
  amount: IntLike;
  remainingAmount: IntLike;
  lastReset: IntLike;
  period: Period;
};

export type SpendingLimitState = {
  /** Amount a member can spend now, after any reset the next use would apply. */
  remaining: bigint;
  /** Unix time (seconds) after which the pool resets. Null for OneTime. */
  nextReset: number | null;
};

/**
 * The state that spending_limit_use would see at `nowSeconds`. Mirrors the
 * reset in spending_limit_use.rs: the pool resets when strictly more than one
 * period has passed since `last_reset`, and `last_reset` moves forward by
 * whole periods.
 */
export function spendingLimitState(
  limit: SpendingLimitTiming,
  nowSeconds: number
): SpendingLimitState {
  const amount = BigInt(limit.amount.toString());
  const storedRemaining = BigInt(limit.remainingAmount.toString());
  const periodSeconds = PERIOD_SECONDS[limit.period];
  if (periodSeconds === null || periodSeconds === undefined) {
    return { remaining: storedRemaining, nextReset: null };
  }

  const period = BigInt(periodSeconds);
  let lastReset = BigInt(limit.lastReset.toString());
  let remaining = storedRemaining;
  const passed = BigInt(Math.floor(nowSeconds)) - lastReset;
  if (passed > period) {
    remaining = amount;
    lastReset += (passed / period) * period;
  }
  // The reset needs `passed > period`, so it first applies one second after this time.
  return { remaining, nextReset: Number(lastReset + period) };
}

/** Keys in a limit's members list that are no longer members of the multisig. */
export function removedMembers(
  limitMembers: PublicKey[],
  multisigMembers: PublicKey[]
): PublicKey[] {
  const current = new Set(multisigMembers.map((k) => k.toBase58()));
  return limitMembers.filter((k) => !current.has(k.toBase58()));
}

/**
 * Removes duplicate keys and sorts by bytes, the order of Rust's `Pubkey`.
 * SpendingLimit::invariant rejects duplicates.
 */
export function normalizeKeys(keys: PublicKey[]): PublicKey[] {
  const unique = new Map(keys.map((k) => [k.toBase58(), k]));
  return [...unique.values()].sort((a, b) => Buffer.compare(a.toBuffer(), b.toBuffer()));
}

/**
 * Checks a send against the rules of spending_limit_use. Returns an error
 * message, or null when the program would accept the send.
 */
export function validateSpend({
  amount,
  remaining,
  destination,
  destinations,
}: {
  amount: bigint;
  remaining: bigint;
  destination: PublicKey;
  destinations: PublicKey[];
}): string | null {
  if (amount > remaining) {
    return 'The amount is more than the remaining amount of this limit.';
  }
  if (destinations.length > 0 && !destinations.some((d) => d.equals(destination))) {
    return 'This limit cannot send to that address.';
  }
  return null;
}

type ConfigActionLike = { __kind: string; [field: string]: unknown };

/**
 * The SpendingLimit accounts that config_transaction_execute needs in
 * `remaining_accounts`: AddSpendingLimit creates the account and
 * RemoveSpendingLimit closes it. Without them the execute fails with
 * MissingAccount.
 */
export function spendingLimitAccountsForActions(
  actions: ConfigActionLike[],
  multisigPda: PublicKey,
  programId: PublicKey
): PublicKey[] {
  const accounts: PublicKey[] = [];
  for (const action of actions) {
    if (action.__kind === 'AddSpendingLimit') {
      const [pda] = multisig.getSpendingLimitPda({
        multisigPda,
        createKey: action.createKey as PublicKey,
        programId,
      });
      accounts.push(pda);
    } else if (action.__kind === 'RemoveSpendingLimit') {
      accounts.push(action.spendingLimit as PublicKey);
    }
  }
  return accounts;
}

/**
 * Parses addresses separated by new lines, commas or spaces. Removes
 * duplicates and keeps the input order.
 */
export function parseAddressList(text: string): { keys: PublicKey[] } | { error: string } {
  const parts = text.split(/[\s,]+/).filter(Boolean);
  const keys = new Map<string, PublicKey>();
  for (const part of parts) {
    let key: PublicKey;
    try {
      key = new PublicKey(part);
    } catch {
      return { error: `Invalid address: ${part}` };
    }
    keys.set(key.toBase58(), key);
  }
  return { keys: [...keys.values()] };
}
