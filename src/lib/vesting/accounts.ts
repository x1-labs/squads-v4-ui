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
