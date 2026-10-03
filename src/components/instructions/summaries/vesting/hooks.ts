import { Connection } from '@solana/web3.js';
import { DecodedInstruction } from '@/lib/transaction/simpleDecoder';
import {
  VestingGrantAccount,
  VestingTreasuryAccount,
  fetchAccountExists,
  fetchLamports,
  fetchRentExemption,
  fetchVestingGrant,
  fetchVestingTreasury,
} from '@/lib/vesting/accounts';
import { TreasuryFacts } from '@/lib/vesting/preflight';
import { enumVariantName, toBigInt } from '@/lib/vesting/values';
import { useProgramAccount } from '../useProgramAccount';
import { accountByName } from '../shared';

/** Normalize the treasury fields the program's guards depend on. */
export function treasuryFacts(treasury: VestingTreasuryAccount | null): TreasuryFacts | null {
  if (!treasury) return null;
  return {
    admin: treasury.admin.toBase58(),
    paused: treasury.paused,
    claimsActive: treasury.claims_active,
    liquidVault: treasury.liquid_vault.toBase58(),
    outstanding: toBigInt(treasury.total_outstanding),
  };
}

/** Whether a grant has any claim — after that, cancel and replace are refused. */
export function grantHasClaims(grant: VestingGrantAccount): boolean {
  return (
    (toBigInt(grant.principal_claimed) ?? BigInt(0)) > BigInt(0) ||
    (toBigInt(grant.yield_claimed) ?? BigInt(0)) > BigInt(0)
  );
}

export function grantFacts(grant: VestingGrantAccount | null) {
  return grant ? { status: enumVariantName(grant.status), hasClaims: grantHasClaims(grant) } : null;
}

/** Current `Treasury` for the deployment an instruction targets. */
export function useVestingTreasury(
  instruction: DecodedInstruction,
  connection: Connection
): { treasury: VestingTreasuryAccount | null; loading: boolean } {
  const { data, loading } = useProgramAccount(`vesting-treasury:${instruction.programId}`, () =>
    fetchVestingTreasury(connection, instruction.programId)
  );
  return { treasury: data, loading };
}

/** A grant by address; pass a falsy address when there is nothing to load. */
export function useVestingGrantAt(
  connection: Connection,
  address: string | undefined
): { grant: VestingGrantAccount | null; loading: boolean } {
  const { data, loading } = useProgramAccount(address && `vesting-grant:${address}`, () =>
    fetchVestingGrant(connection, address!)
  );
  return { grant: data, loading };
}

/** Current state of the grant an instruction acts on (its `grant` account). */
export function useVestingGrant(
  instruction: DecodedInstruction,
  connection: Connection,
  fallbackIndex: number
): { grant: VestingGrantAccount | null; address?: string; loading: boolean } {
  const address = accountByName(instruction, 'grant', fallbackIndex);
  const { grant, loading } = useVestingGrantAt(connection, address);
  return { grant, address, loading };
}

/**
 * Lamport balance of an account (the vault, or a payer). `balance` is null
 * while loading, when not requested, or when the read failed — callers treat a
 * settled null as "could not verify", never as passing.
 */
export function useVaultBalance(
  connection: Connection,
  address: string | undefined
): { balance: bigint | null; loading: boolean } {
  const { data, loading } = useProgramAccount(address && `vesting-lamports:${address}`, () =>
    fetchLamports(connection, address!).then((result) => (result.ok ? result.value : null))
  );
  return { balance: data, loading };
}

/** Rent-exempt minimum for an account of `size` bytes (0 = the vault's floor). */
export function useRentExemption(
  connection: Connection,
  size: number
): { rent: bigint | null; loading: boolean } {
  const { data, loading } = useProgramAccount(`vesting-rent:${size}`, () =>
    fetchRentExemption(connection, size).then((result) => (result.ok ? result.value : null))
  );
  return { rent: data, loading };
}

/** Rent-exempt minimum for a zero-data account — the vault must always keep it. */
export function useZeroDataRent(connection: Connection) {
  return useRentExemption(connection, 0);
}

/**
 * Whether an account exists, for `init` checks. `exists` is null while
 * loading, when not requested, or when the read failed.
 */
export function useAccountExists(
  connection: Connection,
  address: string | undefined
): { exists: boolean | null; loading: boolean } {
  const { data, loading } = useProgramAccount(address && `vesting-exists:${address}`, () =>
    fetchAccountExists(connection, address!).then((result) => (result.ok ? result.value : null))
  );
  return { exists: data, loading };
}
