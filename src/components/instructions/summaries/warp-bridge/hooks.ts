import { Connection } from '@solana/web3.js';
import { DecodedInstruction } from '@/lib/transaction/simpleDecoder';
import {
  BridgeConfigAccount,
  BridgeRolesAccount,
  BridgeVaultAccount,
  GuardianSetAccount,
  RecoveryPolicyAccount,
  TokenRegistryAccount,
  fetchBridgeConfig,
  fetchBridgeRoles,
  fetchBridgeVault,
  fetchGuardianSet,
  fetchRecoveryPolicy,
  fetchTokenRegistry,
  fetchTokenRegistryAt,
  BridgeConfigAccount as ConfigForFacts,
  IncomingMsgAccount,
  getBridgeConfigPda,
  getBridgeRolesPda,
  getIncomingMsgPda,
  getRecoveryPolicyPda,
  readBridgeAccount,
} from '@/lib/warpBridge/accounts';
import {
  BridgeFacts,
  IncomingFacts,
  RecoveryModeName,
  applyPriorEffects,
  unknownFacts,
} from '@/lib/warpBridge/preflight';
import { enumVariantName, formatCounterparty, toBigInt } from '@/lib/warpBridge/values';
import { decodeSymbol } from '@/lib/warpBridge/values';
import { useProgramAccount } from '../useProgramAccount';
import { readPubkeyArg } from '../shared';

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

/** Current `RecoveryPolicy`; null until it has been initialized. */
export function useRecoveryPolicy(
  instruction: DecodedInstruction,
  connection: Connection
): { policy: RecoveryPolicyAccount | null; loading: boolean } {
  const { data, loading } = useProgramAccount(`recovery-policy:${instruction.programId}`, () =>
    fetchRecoveryPolicy(connection, instruction.programId)
  );
  return { policy: data, loading };
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

/**
 * Resolve the token for instructions that pass only the `token_registry`
 * account (recovery and delayed-release paths name no mint in their args).
 */
export function useBridgeTokenFromRegistryAccount(
  instruction: DecodedInstruction,
  connection: Connection
): BridgeTokenContext & { localMint?: string } {
  const registryAddress = instruction.accounts?.find(
    (account) => account.name === 'token_registry'
  )?.pubkey;

  const { data: registry, loading } = useProgramAccount(
    registryAddress && `token-registry-at:${instruction.programId}:${registryAddress}`,
    () => fetchTokenRegistryAt(connection, registryAddress!)
  );

  return {
    localMint: registry?.local_mint?.toBase58(),
    registry,
    decimals: registry ? registry.decimals : null,
    symbol: registry ? decodeSymbol(registry.symbol) : null,
    loading,
  };
}

/**
 * Chain state for preflight checks, with earlier instructions in the proposal
 * applied. Values that could not be read stay `undefined` so guards report
 * them as unverified.
 */
export function useBridgeFacts(
  instruction: DecodedInstruction,
  connection: Connection,
  priorInstructions: DecodedInstruction[] | undefined,
  registryAddress?: string
): { facts: BridgeFacts; loading: boolean } {
  const programId = instruction.programId;
  const { data, loading } = useProgramAccount(
    `bridge-facts:${connection.rpcEndpoint}:${programId}:${registryAddress ?? ''}`,
    async () => {
      const [config, roles, policy, registry] = await Promise.all([
        readBridgeAccount<ConfigForFacts>(connection, 'Config', getBridgeConfigPda(programId)),
        readBridgeAccount<BridgeRolesAccount>(connection, 'Roles', getBridgeRolesPda(programId)),
        readBridgeAccount<RecoveryPolicyAccount>(
          connection,
          'RecoveryPolicy',
          getRecoveryPolicyPda(programId)
        ),
        registryAddress
          ? readBridgeAccount<TokenRegistryAccount>(
              connection,
              'TokenRegistryEntry',
              registryAddress
            )
          : Promise.resolve(null),
      ]);
      const facts = unknownFacts();
      if (config.ok && config.value) {
        facts.admin = config.value.admin.toBase58();
        facts.configPaused = config.value.paused;
        facts.chainId = config.value.chain_id;
        facts.manualReviewEnabled = config.value.manual_review_enabled;
      }
      if (roles.ok) {
        facts.roles = roles.value
          ? {
              operationsAdmin: roles.value.operations_admin?.toBase58() ?? null,
              pauser: roles.value.pauser?.toBase58() ?? null,
            }
          : null;
      }
      if (policy.ok) {
        facts.recoveryMode = policy.value
          ? ((enumVariantName(policy.value.mode) as RecoveryModeName | null) ?? undefined)
          : null;
      }
      if (registryAddress && registry && registry.ok && registry.value) {
        facts.tokenPaused[registryAddress] = registry.value.paused;
      }
      return facts;
    }
  );
  return {
    facts: applyPriorEffects(data ?? unknownFacts(), priorInstructions, programId),
    loading,
  };
}

/**
 * Whether an account is occupied (program-owned or holding data): `false` when
 * absent or only prefunded, `undefined` while loading or when the read failed.
 */
export function useBridgeAccountExists(
  connection: Connection,
  address: string | undefined
): { exists: boolean | undefined; loading: boolean } {
  const { data, loading } = useProgramAccount(
    address && `bridge-exists:${connection.rpcEndpoint}:${address}`,
    () =>
      readBridgeAccount<boolean>(connection, null, address!).then((result) =>
        result.ok ? { exists: result.value === true } : null
      )
  );
  return { exists: data ? data.exists : undefined, loading };
}

/** The `IncomingMsg` for a source sequence: `null` if absent, `undefined` if unread. */
export function useIncomingMsg(
  instruction: DecodedInstruction,
  connection: Connection,
  sourceSeq: unknown
): { incoming: IncomingFacts | null | undefined; loading: boolean } {
  // Read the PDA the program derives, not whatever the proposal passes; the
  // summary checks the passed account against it separately.
  const seq = toBigInt(sourceSeq);
  const address =
    seq !== null ? getIncomingMsgPda(instruction.programId, seq).toBase58() : undefined;
  const { data, loading } = useProgramAccount(
    address && `bridge-incoming:${connection.rpcEndpoint}:${address}`,
    () =>
      readBridgeAccount<IncomingMsgAccount>(connection, 'IncomingMsg', address!).then((result) =>
        result.ok
          ? {
              value: result.value
                ? {
                    processed: result.value.processed,
                    claimed: result.value.claimed,
                    claimableAfter: toBigInt(result.value.claimable_after),
                    sender: formatCounterparty(result.value.sender),
                    tokenMint: result.value.token_mint?.toBase58() ?? null,
                  }
                : null,
            }
          : null
      )
  );
  return { incoming: data ? data.value : undefined, loading };
}
