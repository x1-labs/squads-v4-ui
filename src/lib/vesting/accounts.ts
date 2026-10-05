import { Connection, PublicKey } from '@solana/web3.js';
import vestingIdl from '../idls/vesting.json';
import { createAnchorAccountFetcher } from '../idls/accountFetcher';
import { getTreasuryPda } from './pdas';

export * from './pdas';

/**
 * The on-chain `Treasury`. Numeric fields keep their decoded form (BN for
 * u64s); use the helpers in `values.ts` to normalize them.
 */
export interface VestingTreasuryAccount {
  admin: PublicKey;
  paused: boolean;
  claims_active: boolean;
  principal_schedule: unknown;
  liquid_vault: PublicKey;
  /** All unclaimed principal plus fixed yield, vested or not. */
  total_outstanding: unknown;
  total_fulfilled: unknown;
  bump: number;
  vault_bump: number;
}

/** The on-chain `Grant`. */
export interface VestingGrantAccount {
  grant_id: unknown;
  beneficiary: PublicKey;
  principal_total: unknown;
  principal_claimed: unknown;
  yield_total: unknown;
  yield_claimed: unknown;
  claimed_from_allocation: unknown;
  claimed_from_yield: unknown;
  start_ts: unknown;
  cliff_ts: unknown;
  end_ts: unknown;
  status: unknown;
  bump: number;
}

const fetchVestingAccount = createAnchorAccountFetcher(vestingIdl, 'vesting');

/** Current `Treasury` for the deployment an instruction targets. */
export function fetchVestingTreasury(
  connection: Connection,
  programId: string | PublicKey
): Promise<VestingTreasuryAccount | null> {
  return fetchVestingAccount<VestingTreasuryAccount>(
    connection,
    'Treasury',
    getTreasuryPda(programId)
  );
}

/**
 * A read that may fail. Summaries must distinguish "could not read" from a
 * real value, so failures surface as unverified checks instead of passing.
 */
export type ReadResult<T> = { ok: true; value: T } | { ok: false };

const BALANCE_TTL_MS = 30_000;
const balanceCache = new Map<string, { fetchedAt: number; value: Promise<ReadResult<bigint>> }>();
const rentCache = new Map<string, Promise<ReadResult<bigint>>>();
const existsCache = new Map<string, { fetchedAt: number; value: Promise<ReadResult<boolean>> }>();

/**
 * Lamport balance of an account, briefly cached so a batch of grant proposals
 * reads the vault once. Never rejects; failures are not cached.
 */
export function fetchLamports(
  connection: Connection,
  address: string | PublicKey
): Promise<ReadResult<bigint>> {
  const key = `${connection.rpcEndpoint}:${typeof address === 'string' ? address : address.toBase58()}`;
  const cached = balanceCache.get(key);
  if (cached && Date.now() - cached.fetchedAt < BALANCE_TTL_MS) return cached.value;

  const value: Promise<ReadResult<bigint>> = connection
    .getBalance(typeof address === 'string' ? new PublicKey(address) : address)
    .then((lamports) => ({ ok: true as const, value: BigInt(lamports) }))
    .catch((error) => {
      console.warn('Failed to read vesting vault balance:', error);
      balanceCache.delete(key);
      return { ok: false as const };
    });
  balanceCache.set(key, { fetchedAt: Date.now(), value });
  return value;
}

/**
 * Rent-exempt minimum for an account of `size` bytes, fetched once per RPC
 * endpoint and size. Never rejects; failures are not cached.
 */
export function fetchRentExemption(
  connection: Connection,
  size: number
): Promise<ReadResult<bigint>> {
  const key = `${connection.rpcEndpoint}:${size}`;
  const cached = rentCache.get(key);
  if (cached) return cached;

  const value: Promise<ReadResult<bigint>> = connection
    .getMinimumBalanceForRentExemption(size)
    .then((lamports) => ({ ok: true as const, value: BigInt(lamports) }))
    .catch((error) => {
      console.warn('Failed to read rent-exempt minimum:', error);
      rentCache.delete(key);
      return { ok: false as const };
    });
  rentCache.set(key, value);
  return value;
}

/**
 * Whether an account exists at all. Unlike the decoding fetcher, this tells a
 * missing account apart from a failed read, which matters for `init` checks.
 * Never rejects; failures are not cached.
 */
export function fetchAccountExists(
  connection: Connection,
  address: string | PublicKey
): Promise<ReadResult<boolean>> {
  const key = `${connection.rpcEndpoint}:${typeof address === 'string' ? address : address.toBase58()}`;
  const cached = existsCache.get(key);
  if (cached && Date.now() - cached.fetchedAt < BALANCE_TTL_MS) return cached.value;

  const value: Promise<ReadResult<boolean>> = connection
    .getAccountInfo(typeof address === 'string' ? new PublicKey(address) : address)
    .then((info) => ({ ok: true as const, value: info !== null }))
    .catch((error) => {
      console.warn('Failed to check vesting account existence:', error);
      existsCache.delete(key);
      return { ok: false as const };
    });
  existsCache.set(key, { fetchedAt: Date.now(), value });
  return value;
}

/** Account sizes (8-byte discriminator + `LEN`) from `programs/vesting/src/state.rs`. */
export const GRANT_ACCOUNT_SIZE = 8 + 114;

/** A `Grant` by address — instructions that act on a grant carry it as an account. */
export function fetchVestingGrant(
  connection: Connection,
  grant: string | PublicKey
): Promise<VestingGrantAccount | null> {
  return fetchVestingAccount<VestingGrantAccount>(
    connection,
    'Grant',
    typeof grant === 'string' ? new PublicKey(grant) : grant
  );
}
