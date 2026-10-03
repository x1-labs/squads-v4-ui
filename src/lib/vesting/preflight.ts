/**
 * Mirror of the vesting program's handler guards, so a summary can tell a
 * signer *before* everyone approves that the program will reject a proposal.
 *
 * Each check returns the error the program would raise. Checks whose inputs
 * could not be read (an RPC failure, a missing account) are reported as
 * unverified rather than silently treated as passing.
 *
 * Checks use the chain state as it is now. They do not simulate earlier
 * instructions in the same proposal, which can change the treasury, the vault
 * or a grant before a later instruction runs.
 *
 * Guards (vesting `feat/v2`): every instruction checks the treasury PDA seeds;
 * every admin instruction is `has_one = admin`; activate_claims, create_grant,
 * cancel_grant, replace_beneficiary and the claims also require `!paused`;
 * cancel/replace require an `Active` grant with no claims. pause and
 * transfer_admin work while paused.
 */

/** Error codes from the vesting IDL (`errors`). */
export const VESTING_ERRORS = {
  Unauthorized: 6000,
  Paused: 6001,
  InvalidSchedule: 6002,
  InvalidAmount: 6003,
  AmountExceedsClaimable: 6004,
  InvalidState: 6005,
  NothingToClaim: 6006,
  ClaimsNotActive: 6007,
  MathOverflow: 6008,
  InsufficientVaultBalance: 6009,
  AlreadyHasActivity: 6010,
  WrongBeneficiary: 6011,
} as const;

/** Anchor account-constraint errors, which fire before the handler body runs. */
export const ANCHOR_ERRORS = {
  ConstraintHasOne: 2001,
  ConstraintSeeds: 2006,
  ConstraintAddress: 2012,
} as const;

export const U64_MAX = BigInt('18446744073709551615');

export type VestingErrorName = keyof typeof VESTING_ERRORS;
export type AnchorErrorName = keyof typeof ANCHOR_ERRORS;

export interface Rejection {
  /** Program or Anchor error name, or a runtime failure label. */
  error: string;
  code?: number;
  reason: string;
}

export interface PreflightResult {
  rejections: Rejection[];
  unverified: string[];
}

export const emptyPreflight = (): PreflightResult => ({ rejections: [], unverified: [] });

export function reject(result: PreflightResult, error: VestingErrorName, reason: string): void {
  result.rejections.push({ error, code: VESTING_ERRORS[error], reason });
}

export function rejectConstraint(
  result: PreflightResult,
  error: AnchorErrorName,
  reason: string
): void {
  result.rejections.push({ error, code: ANCHOR_ERRORS[error], reason });
}

/** Treasury fields the guards depend on, already normalized. */
export interface TreasuryFacts {
  admin: string;
  paused: boolean;
  claimsActive: boolean;
  liquidVault: string;
  outstanding: bigint | null;
}

/** `seeds = [b"treasury"]`: the treasury account passed must be the PDA. */
export function checkTreasuryAccount(
  result: PreflightResult,
  passedTreasury: string | undefined,
  expectedTreasuryPda: string
): void {
  if (passedTreasury && passedTreasury !== expectedTreasuryPda) {
    rejectConstraint(result, 'ConstraintSeeds', 'The treasury account is not the treasury PDA');
  }
}

/**
 * `has_one = admin` (and `!paused` where the handler requires it). `treasury`
 * is null when it could not be read.
 */
export function checkAdminGuards(
  result: PreflightResult,
  treasury: TreasuryFacts | null,
  signer: string | undefined,
  requiresUnpaused: boolean
): void {
  if (!treasury) {
    result.unverified.push('Treasury account could not be read — admin and pause checks skipped');
    return;
  }
  if (signer && signer !== treasury.admin) {
    rejectConstraint(
      result,
      'ConstraintHasOne',
      `Signer is not the treasury admin (${treasury.admin})`
    );
  }
  if (requiresUnpaused && treasury.paused) {
    reject(result, 'Paused', 'The treasury is paused');
  }
}

/** The vault account passed must be the treasury's liquid vault (address + seeds constraint). */
export function checkVaultAccount(
  result: PreflightResult,
  treasury: TreasuryFacts | null,
  passedVault: string | undefined,
  expectedVaultPda: string
): void {
  if (!passedVault) return;
  if (passedVault !== expectedVaultPda || (treasury && passedVault !== treasury.liquidVault)) {
    rejectConstraint(
      result,
      'ConstraintAddress',
      'The vault account is not the treasury’s liquid vault'
    );
  }
}

/**
 * `balance ≥ required`. A balance or requirement that could not be read leaves
 * the check unverified.
 */
export function checkCoverage(
  result: PreflightResult,
  balance: bigint | null,
  required: bigint | null,
  what: string
): void {
  if (balance === null || required === null) {
    result.unverified.push(`Vault balance could not be read — ${what} not verified`);
    return;
  }
  if (balance < required) {
    reject(result, 'InsufficientVaultBalance', `The vault does not cover ${what}`);
  }
}

/** Checked u64 arithmetic: the program raises MathOverflow past u64::MAX. */
export function checkU64(result: PreflightResult, value: bigint | null, what: string): void {
  if (value !== null && value > U64_MAX) {
    reject(result, 'MathOverflow', `${what} exceeds the u64 maximum`);
  }
}

/** `cancel_grant` / `replace_beneficiary`: the grant must be `Active` with no claims. */
export function checkGrantUntouched(
  result: PreflightResult,
  grant: { status: string | null; hasClaims: boolean } | null
): void {
  if (!grant) {
    result.unverified.push('Grant account could not be read — status and claims not verified');
    return;
  }
  if (grant.status !== 'Active') {
    reject(result, 'InvalidState', `The grant is ${grant.status ?? 'not active'}, not Active`);
  }
  if (grant.hasClaims) {
    reject(result, 'AlreadyHasActivity', 'The beneficiary has already claimed from this grant');
  }
}

/**
 * `init` fails when the account already exists. `exists` is null when the
 * existence check itself failed.
 */
export function checkAccountFree(
  result: PreflightResult,
  exists: boolean | null,
  what: string
): void {
  if (exists === null) {
    result.unverified.push(`Could not check whether ${what} already exists`);
  } else if (exists) {
    result.rejections.push({ error: 'AccountAlreadyInUse', reason: `${what} already exists` });
  }
}

export function willFail(result: PreflightResult): boolean {
  return result.rejections.length > 0;
}
