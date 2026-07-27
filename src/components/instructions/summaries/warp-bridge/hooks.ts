import { Connection, PublicKey } from '@solana/web3.js';
import { DecodedInstruction } from '@/lib/transaction/simpleDecoder';
import {
  BridgeConfigAccount,
  BridgeRolesAccount,
  BridgeVaultAccount,
  GuardianSetAccount,
  TokenRegistryAccount,
  fetchBridgeConfig,
  fetchBridgeRoles,
  fetchBridgeVault,
  fetchGuardianSet,
  fetchTokenRegistry,
} from '@/lib/warpBridge/accounts';
import { decodeSymbol } from '@/lib/warpBridge/values';
import { useProgramAccount } from '../useProgramAccount';

/** Current bridge `Config` for the deployment an instruction targets. */
export function useBridgeConfig(
  instruction: DecodedInstruction,
  connection: Connection
): { config: BridgeConfigAccount | null; loading: boolean } {
  const { data, loading } = useProgramAccount(`bridge-config:${instruction.programId}`, () =>
    fetchBridgeConfig(connection, instruction.programId)
  );
  return { config: data, loading };
}

/** Current delegated `Roles`. */
export function useBridgeRoles(
  instruction: DecodedInstruction,
  connection: Connection
): { roles: BridgeRolesAccount | null; loading: boolean } {
  const { data, loading } = useProgramAccount(`bridge-roles:${instruction.programId}`, () =>
    fetchBridgeRoles(connection, instruction.programId)
  );
  return { roles: data, loading };
}

/** Current v2 `GuardianSet`. */
export function useGuardianSet(
  instruction: DecodedInstruction,
  connection: Connection
): { guardianSet: GuardianSetAccount | null; loading: boolean } {
  const { data, loading } = useProgramAccount(`guardian-set:${instruction.programId}`, () =>
    fetchGuardianSet(connection, instruction.programId)
  );
  return { guardianSet: data, loading };
}

/** Current `Vault` for a token. */
export function useBridgeVault(
  instruction: DecodedInstruction,
  connection: Connection,
  localMint?: string
): { vault: BridgeVaultAccount | null; loading: boolean } {
  const { data, loading } = useProgramAccount(
    localMint && `bridge-vault:${instruction.programId}:${localMint}`,
    () => fetchBridgeVault(connection, instruction.programId, localMint!)
  );
  return { vault: data, loading };
}

export interface BridgeTokenContext {
  /** The token's registry entry, when it is already registered. */
  registry: TokenRegistryAccount | null;
  /** Decimals from the registry, or from the instruction when registering. */
  decimals: number | null;
  /** Symbol from the registry, or from the instruction when registering. */
  symbol: string | null;
  loading: boolean;
}

function readPubkeyArg(value: unknown): string | undefined {
  if (!value) return undefined;
  if (value instanceof PublicKey) return value.toBase58();
  if (typeof value === 'string') return value;
  try {
    return new PublicKey(value as any).toBase58();
  } catch {
    return undefined;
  }
}

/**
 * Resolve the token a bridge instruction acts on.
 *
 * The registry entry is the authoritative source for decimals and symbol, so
 * amounts render in real token units instead of raw integers. `register_token`
 * carries both in its arguments because no entry exists yet.
 */
export function useBridgeToken(
  instruction: DecodedInstruction,
  connection: Connection
): BridgeTokenContext & { localMint?: string } {
  const localMint =
    readPubkeyArg(instruction.args?.local_mint) ??
    instruction.accounts?.find((account) => account.name === 'token_mint')?.pubkey;

  const { data: registry, loading } = useProgramAccount(
    localMint && `token-registry:${instruction.programId}:${localMint}`,
    () => fetchTokenRegistry(connection, instruction.programId, localMint!)
  );

  // register_token supplies decimals/symbol directly — there is no entry yet.
  const argDecimals =
    typeof instruction.args?.decimals === 'number' ? instruction.args.decimals : null;
  const argSymbol = typeof instruction.args?.symbol === 'string' ? instruction.args.symbol : null;

  return {
    localMint,
    registry,
    decimals: registry ? registry.decimals : argDecimals,
    symbol: registry ? decodeSymbol(registry.symbol) : argSymbol,
    loading,
  };
}
