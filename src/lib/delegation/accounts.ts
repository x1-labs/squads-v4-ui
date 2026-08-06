import { Connection, PublicKey } from '@solana/web3.js';
import delegationProgramIdl from '../idls/delegation_program.json';
import { createAnchorAccountFetcher } from '../idls/accountFetcher';

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
  strike_penalty_bps: number;
  strike_min_cap_bps: number;
  strike_decay_epochs: number;
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
  /**
   * Penalty points for recent removals, not a removal count. A removal for poor
   * performance adds `strike_decay_epochs` points and each eligible epoch works one
   * off, so the value doubles as the good epochs left before the penalty clears.
   */
  removal_score: number;
}

/** Cached reader for this program's on-chain accounts. */
const fetchDelegationAccount = createAnchorAccountFetcher(
  delegationProgramIdl,
  'delegation program'
);

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
