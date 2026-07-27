import { Connection, PublicKey } from '@solana/web3.js';
import { BorshAccountsCoder } from '@coral-xyz/anchor';
import delegationProgramIdl from '../idls/delegation_program.json';

/**
 * Program IDs the delegation program is deployed under. The UI runs against
 * several networks from one bundle, so every known deployment is registered and
 * PDAs are derived from whichever ID the instruction actually used.
 */
export const DELEGATION_PROGRAM_IDS = {
  mainnet: 'x1Dp8D2X1nkHXZbEUQrh58mrUUSwEynYoVdXG5tE268',
  testnet: 'X1DPvnLXekvd6EtDsPVqahzhziKx3Zj1z8WkD93xebg',
  localnet: 'X1dpTaMXkdEHQwhUk5oidxK9RXer8WoUCinWTyRmVjQ',
} as const;

export const DELEGATION_PROGRAM_ID_LIST: string[] = Object.values(DELEGATION_PROGRAM_IDS);

export const DELEGATION_CONFIG_SEED = 'delegation_config';
export const CLUSTER_INFO_SEED = 'cluster_info';
export const VALIDATOR_SEED = 'validator';

function toPublicKey(value: string | PublicKey): PublicKey {
  return typeof value === 'string' ? new PublicKey(value) : value;
}

/** Derive the singleton `DelegationConfig` PDA for a given deployment. */
export function getDelegationConfigPda(programId: string | PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from(DELEGATION_CONFIG_SEED)],
    toPublicKey(programId)
  )[0];
}

/** Derive the singleton `ClusterInfo` PDA for a given deployment. */
export function getClusterInfoPda(programId: string | PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from(CLUSTER_INFO_SEED)],
    toPublicKey(programId)
  )[0];
}

/** Derive the `ValidatorInfo` PDA for a vote account. */
export function getValidatorInfoPda(
  programId: string | PublicKey,
  voteAccount: string | PublicKey
): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from(VALIDATOR_SEED), toPublicKey(voteAccount).toBuffer()],
    toPublicKey(programId)
  )[0];
}

/**
 * The on-chain `DelegationConfig`. Numeric fields keep their decoded form (BN
 * for u64s); use the helpers in `values.ts` to normalize them.
 */
export interface DelegationConfigAccount {
  version: number;
  authority: PublicKey;
  max_commission_percent: number;
  min_self_stake: unknown;
  max_total_stake: unknown;
  max_validator_stake_pct: number;
  skip_rate_tolerance_pct: number;
  vote_credits_threshold_pct: number;
  min_validator_version: number;
  reserve_stake_pct: number;
  max_validators: number;
  emergency_pause: boolean;
  last_updated_epoch: unknown;
  bump: number;
  stake_matching_cap: unknown;
  base_allocation_weight: number;
  match_allocation_weight: number;
  min_stake_adjustment_pct: number;
  bot_authority: PublicKey;
  reviewer_authority: PublicKey;
}

/** The on-chain `ClusterInfo`, tracking epoch processing and the bot's lock. */
export interface ClusterInfoAccount {
  version: number;
  last_updated_epoch: unknown;
  bump: number;
  locked_until_slot: unknown;
}

/** The on-chain `ValidatorInfo` for a single vote account. */
export interface ValidatorInfoAccount {
  version: number;
  vote_account: PublicKey;
  status: unknown;
  last_updated_epoch: unknown;
  bump: number;
  failing_criteria: unknown[];
  stake_multiplier_bps: number;
  last_stake_change_epoch: unknown;
}

let accountsCoder: BorshAccountsCoder | null | undefined;

function getAccountsCoder(): BorshAccountsCoder | null {
  if (accountsCoder === undefined) {
    try {
      accountsCoder = new BorshAccountsCoder(delegationProgramIdl as any);
    } catch (error) {
      console.warn('Failed to build delegation program accounts coder:', error);
      accountsCoder = null;
    }
  }
  return accountsCoder;
}

const CACHE_TTL_MS = 30_000;
const accountCache = new Map<string, { fetchedAt: number; value: Promise<unknown> }>();

/**
 * Fetch and decode a delegation program account, briefly caching the result
 * because several summaries can render for the same transaction. Resolves to
 * null when the account is missing or cannot be decoded, and failures are not
 * cached so a transient RPC error doesn't suppress the next render.
 */
function fetchDelegationAccount<T>(
  connection: Connection,
  accountName: string,
  address: PublicKey
): Promise<T | null> {
  const cacheKey = `${accountName}:${address.toBase58()}`;
  const cached = accountCache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.value as Promise<T | null>;
  }

  const value = (async () => {
    const coder = getAccountsCoder();
    if (!coder) return null;

    try {
      const info = await connection.getAccountInfo(address);
      if (!info) return null;
      return coder.decode<T>(accountName, info.data);
    } catch (error) {
      console.warn(`Failed to fetch delegation ${accountName} at ${address.toBase58()}:`, error);
      return null;
    }
  })();

  value.then((result) => {
    if (result === null) accountCache.delete(cacheKey);
  });

  accountCache.set(cacheKey, { fetchedAt: Date.now(), value });
  return value as Promise<T | null>;
}

/**
 * Fetch the current on-chain `DelegationConfig`. Summaries use this to show
 * what a proposal actually changes rather than only what it sets.
 */
export function fetchDelegationConfig(
  connection: Connection,
  programId: string
): Promise<DelegationConfigAccount | null> {
  return fetchDelegationAccount<DelegationConfigAccount>(
    connection,
    'DelegationConfig',
    getDelegationConfigPda(programId)
  );
}

/**
 * Fetch the current on-chain `ClusterInfo`, used to show the epoch the bot has
 * processed and whether an epoch lock is currently held.
 */
export function fetchClusterInfo(
  connection: Connection,
  programId: string
): Promise<ClusterInfoAccount | null> {
  return fetchDelegationAccount<ClusterInfoAccount>(
    connection,
    'ClusterInfo',
    getClusterInfoPda(programId)
  );
}

/**
 * Fetch a `ValidatorInfo` by its PDA. Most validator instructions carry no
 * arguments, so resolving the PDA is the only way to name the validator a
 * proposal acts on.
 */
export function fetchValidatorInfo(
  connection: Connection,
  validatorPda: string | PublicKey
): Promise<ValidatorInfoAccount | null> {
  return fetchDelegationAccount<ValidatorInfoAccount>(
    connection,
    'ValidatorInfo',
    toPublicKey(validatorPda)
  );
}
