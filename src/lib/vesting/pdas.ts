import { PublicKey } from '@solana/web3.js';

/**
 * Program IDs the X1 vesting program is deployed under. Each deployment is a
 * separate program instance with its own immutable principal schedule, so the
 * UI registers all of them and derives PDAs from whichever ID an instruction
 * actually targets. Source: `deployments/profiles.json` in x1-labs/vesting.
 */
export const VESTING_PROGRAM_IDS = {
  mainnetMonthly: 'H6y5zco3Ve1K1FY6ZxeEQwFTahTvuvv3DvMY6x442Mk4',
  testnetMonthly: 'EGyez2sBCwhL4ssS9V1L6v5RGx2aeRAGeDTsXoyhTEXn',
  testnetLinear: 'DP2sx8VgCvo26vBdfT1ycUjxxDrXg3YLeUAMrUGC1hnT',
} as const;

export const VESTING_PROGRAM_ID_LIST: string[] = Object.values(VESTING_PROGRAM_IDS);

export const TREASURY_SEED = 'treasury';
export const VAULT_SEED = 'vault';
export const GRANT_SEED = 'grant';

function toPublicKey(value: string | PublicKey): PublicKey {
  return typeof value === 'string' ? new PublicKey(value) : value;
}

/** Derive the singleton `Treasury` PDA for a deployment. */
export function getTreasuryPda(programId: string | PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync([Buffer.from(TREASURY_SEED)], toPublicKey(programId))[0];
}

/** Derive the system-owned liquid vault PDA that holds every grant's XNT. */
export function getLiquidVaultPda(programId: string | PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync([Buffer.from(VAULT_SEED)], toPublicKey(programId))[0];
}

/** Encode a grant id as the program does: u64, little-endian. */
export function grantIdSeed(grantId: bigint | number | string): Buffer {
  const value = BigInt(grantId);
  if (value < BigInt(0) || value > BigInt('18446744073709551615')) {
    throw new RangeError(`grant id out of u64 range: ${grantId}`);
  }
  const seed = Buffer.alloc(8);
  seed.writeBigUInt64LE(value);
  return seed;
}

/** Derive a `Grant` PDA: `["grant", grant_id as u64 LE]`. */
export function getGrantPda(
  programId: string | PublicKey,
  grantId: bigint | number | string
): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from(GRANT_SEED), grantIdSeed(grantId)],
    toPublicKey(programId)
  )[0];
}
