import { Connection, PublicKey } from '@solana/web3.js';
import warpBridgeIdl from '../idls/warp_bridge.json';
import { createAnchorAccountFetcher } from '../idls/accountFetcher';

/**
 * The bridge is deployed under one program ID on every chain it spans, so PDAs
 * derive to the same addresses on each — reads are keyed by RPC endpoint to
 * keep one chain's state from being shown for another.
 */
export const WARP_BRIDGE_PROGRAM_ID = '6JbPTuxVuoTgyQeXFb9MH8C8nUY8NBbLP1Lu4B13JfMD';

export const CONFIG_SEED = 'config';
export const ROLES_SEED = 'roles';
export const GUARDIAN_SET_SEED = 'guardian_set';
export const TOKEN_REGISTRY_SEED = 'token_registry';
export const VAULT_SEED = 'vault';
export const MINT_AUTHORITY_SEED = 'mint_authority';

function toPublicKey(value: string | PublicKey): PublicKey {
  return typeof value === 'string' ? new PublicKey(value) : value;
}

function derive(programId: string | PublicKey, seeds: (Buffer | Uint8Array)[]): PublicKey {
  return PublicKey.findProgramAddressSync(seeds, toPublicKey(programId))[0];
}

/** Singleton bridge `Config` PDA. */
export function getBridgeConfigPda(programId: string | PublicKey): PublicKey {
  return derive(programId, [Buffer.from(CONFIG_SEED)]);
}

/** Singleton `Roles` PDA holding the delegated pauser / fee-manager / registrar keys. */
export function getBridgeRolesPda(programId: string | PublicKey): PublicKey {
  return derive(programId, [Buffer.from(ROLES_SEED)]);
}

/** Singleton v2 `GuardianSet` PDA. */
export function getGuardianSetPda(programId: string | PublicKey): PublicKey {
  return derive(programId, [Buffer.from(GUARDIAN_SET_SEED)]);
}

/** Per-token `TokenRegistryEntry` PDA. */
export function getTokenRegistryPda(
  programId: string | PublicKey,
  localMint: string | PublicKey
): PublicKey {
  return derive(programId, [Buffer.from(TOKEN_REGISTRY_SEED), toPublicKey(localMint).toBuffer()]);
}

/** Per-token `Vault` PDA. */
export function getBridgeVaultPda(
  programId: string | PublicKey,
  localMint: string | PublicKey
): PublicKey {
  return derive(programId, [Buffer.from(VAULT_SEED), toPublicKey(localMint).toBuffer()]);
}

/** Per-token mint authority PDA held by the bridge for wrapped tokens. */
export function getMintAuthorityPda(
  programId: string | PublicKey,
  localMint: string | PublicKey
): PublicKey {
  return derive(programId, [Buffer.from(MINT_AUTHORITY_SEED), toPublicKey(localMint).toBuffer()]);
}

/**
 * Global bridge configuration. Numeric fields keep their decoded form (BN for
 * u64/i64); use the helpers in `values.ts` to normalize them.
 */
export interface BridgeConfigAccount {
  admin: PublicKey;
  paused: boolean;
  guardians: PublicKey[];
  num_guardians: number;
  threshold: number;
  out_seq_counter: unknown;
  in_seq_counter: unknown;
  flat_fee_lamports: unknown;
  percentage_fee_bps: number;
  fee_collector: PublicKey;
  bump: number;
  paused_at: unknown;
  paused_by: PublicKey;
  pause_reason: unknown;
  chain_id: number;
  v1_in_disabled: boolean;
}

/** Delegated roles that may act without full admin rights. */
export interface BridgeRolesAccount {
  pauser: PublicKey | null;
  fee_manager: PublicKey | null;
  registrar: PublicKey | null;
  bump: number;
}

/** Staged-consensus guardian set used by the v2 bridge-in path. */
export interface GuardianSetAccount {
  guardian_set_index: number;
  num_guardians: number;
  threshold: number;
  guardians: PublicKey[];
  bump: number;
}

/** Per-token bridging rules and limits. */
export interface TokenRegistryAccount {
  local_mint: PublicKey;
  decimals: number;
  is_native: boolean;
  symbol: unknown;
  paused: boolean;
  daily_cap: unknown;
  daily_volume: unknown;
  last_reset: unknown;
  min_amount: unknown;
  max_amount: unknown;
  bump: number;
  flat_fee_amount: unknown;
  percentage_fee_bps: number;
  fee_collector_ata: PublicKey;
  whale_threshold: unknown;
  whale_delay_seconds: unknown;
}

/** Per-token vault holding locked native tokens. */
export interface BridgeVaultAccount {
  token_mint: PublicKey;
  total_locked: unknown;
  bump: number;
}

/** Cached reader for this program's on-chain accounts. */
const fetchBridgeAccount = createAnchorAccountFetcher(warpBridgeIdl, 'warp bridge');

/**
 * Fetch the current bridge `Config`. Summaries use this to show what a proposal
 * actually changes rather than only what it sets.
 */
export function fetchBridgeConfig(
  connection: Connection,
  programId: string
): Promise<BridgeConfigAccount | null> {
  return fetchBridgeAccount<BridgeConfigAccount>(
    connection,
    'Config',
    getBridgeConfigPda(programId)
  );
}

/** Fetch the current delegated `Roles`. */
export function fetchBridgeRoles(
  connection: Connection,
  programId: string
): Promise<BridgeRolesAccount | null> {
  return fetchBridgeAccount<BridgeRolesAccount>(connection, 'Roles', getBridgeRolesPda(programId));
}

/** Fetch the current v2 `GuardianSet`. */
export function fetchGuardianSet(
  connection: Connection,
  programId: string
): Promise<GuardianSetAccount | null> {
  return fetchBridgeAccount<GuardianSetAccount>(
    connection,
    'GuardianSet',
    getGuardianSetPda(programId)
  );
}

/**
 * Fetch a token's registry entry. This is the authoritative source for a
 * token's decimals and symbol, so summaries prefer it over mint metadata.
 */
export function fetchTokenRegistry(
  connection: Connection,
  programId: string,
  localMint: string | PublicKey
): Promise<TokenRegistryAccount | null> {
  return fetchBridgeAccount<TokenRegistryAccount>(
    connection,
    'TokenRegistryEntry',
    getTokenRegistryPda(programId, localMint)
  );
}

/** Fetch a token's vault. */
export function fetchBridgeVault(
  connection: Connection,
  programId: string,
  localMint: string | PublicKey
): Promise<BridgeVaultAccount | null> {
  return fetchBridgeAccount<BridgeVaultAccount>(
    connection,
    'Vault',
    getBridgeVaultPda(programId, localMint)
  );
}
