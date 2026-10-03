import { Connection, PublicKey } from '@solana/web3.js';
import { DecodedInstruction } from '@/lib/transaction/simpleDecoder';
import {
  VestingGrantAccount,
  VestingTreasuryAccount,
  fetchVestingGrant,
  fetchVestingTreasury,
} from '@/lib/vesting/accounts';
import { useProgramAccount } from '../useProgramAccount';
import { accountByName } from '../shared';

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

/** Current state of the grant an instruction acts on (its `grant` account). */
export function useVestingGrant(
  instruction: DecodedInstruction,
  connection: Connection,
  fallbackIndex: number
): { grant: VestingGrantAccount | null; address?: string; loading: boolean } {
  const address = accountByName(instruction, 'grant', fallbackIndex);
  const { data, loading } = useProgramAccount(address && `vesting-grant:${address}`, () =>
    fetchVestingGrant(connection, address!)
  );
  return { grant: data, address, loading };
}

/** Lamport balance of the liquid vault, for coverage checks. */
export function useVaultBalance(
  connection: Connection,
  vault?: string
): { balance: bigint | null; loading: boolean } {
  const { data, loading } = useProgramAccount(vault && `vesting-vault-balance:${vault}`, () =>
    connection.getBalance(new PublicKey(vault!)).then((lamports) => BigInt(lamports))
  );
  return { balance: data, loading };
}

/** Rent-exempt minimum for a zero-data account — the vault must keep it. */
export function useZeroDataRent(connection: Connection): bigint | null {
  const { data } = useProgramAccount('vesting-zero-data-rent', () =>
    connection.getMinimumBalanceForRentExemption(0).then((lamports) => BigInt(lamports))
  );
  return data;
}
