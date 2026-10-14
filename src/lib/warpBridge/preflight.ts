/**
 * Mirror of the warp bridge's handler guards for the post-PR-121 governance
 * instructions, so a summary can tell signers *before* everyone approves that
 * the program will reject a proposal.
 *
 * Inputs use three states: a value, `null` when the account does not exist,
 * and `undefined` when it could not be read or decoded. Checks whose inputs are
 * `undefined` are reported as unverified, never treated as passing, and guards
 * this module does not mirror are listed as unverified by the summary that
 * skips them.
 *
 * Earlier instructions in the same proposal are applied first (see
 * `applyPriorEffects`), because #188-style proposals create the recovery
 * policy, pause the token and set the mode before canceling.
 *
 * Source: x1-labs/warp-bridge 05319af — instructions/auth.rs, admin.rs,
 * destination_recovery.rs, source_recovery.rs, post_cancellation_signatures.rs,
 * manual_review.rs and claim.rs.
 */
import type { DecodedInstruction } from '../transaction/simpleDecoder';
import { accountByName, readPubkeyArg } from '../instructions/args';
import { enumVariantName, toBigInt, toNumber } from '../utils/anchorValues';
import { formatBytes32 } from './values';
import type { PreflightResult } from '../preflight';

export { emptyPreflight, willFail } from '../preflight';
export type { PreflightResult, Rejection } from '../preflight';

/** Anchor errors that fire before a handler body runs. */
export const ANCHOR_ERRORS = {
  ConstraintHasOne: 2001,
  ConstraintSeeds: 2006,
  AccountNotInitialized: 3012,
} as const;

/** Error codes from the bridge IDL (`errors`), checked against it by a test. */
export const BRIDGE_ERRORS: Record<string, number> = {
  BridgePaused: 6000,
  TokenPaused: 6001,
  DelayNotElapsed: 6006,
  InvalidSignatures: 6015,
  InvalidSourceChain: 6016,
  InvalidDestinationChain: 6017,
  RecipientMismatch: 6018,
  Unauthorized: 6026,
  InvalidAmountLimits: 6031,
  InvalidDelay: 6032,
  MintMismatch: 6037,
  StaleGuardianSet: 6047,
  RecoveryPolicyDisabled: 6053,
  RecoveryRequiresPause: 6054,
  DestinationAlreadyExecuted: 6055,
  InvalidIncidentId: 6058,
  InvalidRecoveryReason: 6059,
  ReversalPolicyDisabled: 6060,
  InvalidDestinationCancellation: 6061,
  InvalidCancellationProof: 6062,
  CancellationProofConsumed: 6064,
  UnauthorizedManualReviewModeChange: 6071,
  ManualHoldNotReleased: 6072,
  DelayedTransferAlreadyClaimed: 6074,
  InvalidDelayedTransfer: 6075,
  UnauthorizedDelayedRelease: 6076,
};

export const MAX_RECOVERY_REASON_CODE = 31;
/** `claimable_after` sentinel for a transfer held by manual review (`i64::MAX`). */
export const MANUAL_REVIEW_PENDING = BigInt('9223372036854775807');
/** Disabling manual review moves the cutoff to at least now + this (config.rs). */
export const MANUAL_REVIEW_CLOCK_SKEW_SECONDS = 120;

export function reject(result: PreflightResult, error: string, reason: string): void {
  const code = BRIDGE_ERRORS[error] ?? ANCHOR_ERRORS[error as keyof typeof ANCHOR_ERRORS];
  result.rejections.push({ error, code, reason });
}

/** Unknown = `undefined`; absent account = `null`. */
export type Read<T> = T | null | undefined;

export type RecoveryModeName = 'Disabled' | 'CancellationOnly' | 'FullRecovery';

export interface RolesFacts {
  operationsAdmin: string | null;
  pauser: string | null;
}

/** Chain state the guards depend on, normalized to plain values. */
export interface BridgeFacts {
  /** `config.admin` (root). */
  admin: string | undefined;
  configPaused: boolean | undefined;
  chainId: number | undefined;
  manualReviewEnabled: boolean | undefined;
  manualReviewCutoff: bigint | undefined;
  /** `Roles`; `null` when the account does not exist. */
  roles: Read<RolesFacts>;
  /** Recovery mode; `null` when the policy account does not exist. */
  recoveryMode: Read<RecoveryModeName>;
  /** Per-registry pause state, keyed by `token_registry` account address. */
  tokenPaused: Record<string, boolean | undefined>;
}

export const unknownFacts = (): BridgeFacts => ({
  admin: undefined,
  configPaused: undefined,
  chainId: undefined,
  manualReviewEnabled: undefined,
  manualReviewCutoff: undefined,
  roles: undefined,
  recoveryMode: undefined,
  tokenPaused: {},
});

/** A decoded bool argument, or undefined when it is not a bool. */
function boolArg(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

/**
 * The decoder reformats IDL names (`set_token_pause` → `SetTokenPause`), so
 * compare letters and digits only, lowercased.
 */
export function instructionIs(ix: DecodedInstruction, programId: string, name: string): boolean {
  return (
    ix.programId === programId &&
    ix.instructionName.replace(/[^a-zA-Z0-9]/g, '').toLowerCase() ===
      name.replace(/[^a-zA-Z0-9]/g, '').toLowerCase()
  );
}

/**
 * Apply what earlier instructions in the same proposal do to the facts. Only
 * successful execution is assumed — if an earlier instruction would fail, the
 * whole proposal fails anyway. An argument that cannot be decoded makes the
 * fact it would set unknown rather than guessed.
 */
export function applyPriorEffects(
  facts: BridgeFacts,
  prior: DecodedInstruction[] | undefined,
  programId: string
): BridgeFacts {
  const next: BridgeFacts = {
    ...facts,
    roles: facts.roles ? { ...facts.roles } : facts.roles,
    tokenPaused: { ...facts.tokenPaused },
  };
  for (const ix of prior ?? []) {
    if (ix.programId !== programId) continue;
    const is = (name: string) => instructionIs(ix, programId, name);

    if (is('initialize_recovery_policy')) {
      next.recoveryMode = 'Disabled';
    } else if (is('set_recovery_mode')) {
      const mode = enumVariantName(ix.args?.mode);
      next.recoveryMode = (mode as RecoveryModeName | null) ?? undefined;
    } else if (is('set_token_pause')) {
      const registry = accountByName(ix, 'token_registry');
      if (registry) next.tokenPaused[registry] = boolArg(ix.args?.paused);
    } else if (is('update_token_registry')) {
      // `paused: Option<bool>` — None leaves the pause state as it is.
      const registry = accountByName(ix, 'token_registry');
      const paused = ix.args?.paused;
      if (registry && paused !== null && paused !== undefined) {
        next.tokenPaused[registry] = boolArg(paused);
      }
    } else if (is('pause')) {
      next.configPaused = true;
    } else if (is('unpause')) {
      next.configPaused = false;
    } else if (is('set_manual_review')) {
      next.manualReviewEnabled = boolArg(ix.args?.enabled);
    } else if (is('transfer_admin')) {
      // Takes effect immediately (admin.rs `transfer_admin`).
      next.admin = readPubkeyArg(ix.args?.new_admin);
    } else if (is('set_chain_id')) {
      next.chainId = toNumber(ix.args?.chain_id) ?? undefined;
    } else if (is('initialize_roles')) {
      next.roles = { operationsAdmin: null, pauser: null };
    } else if (is('set_role')) {
      const role = enumVariantName(ix.args?.role_type);
      const holder =
        ix.args?.pubkey === null ? null : (readPubkeyArg(ix.args?.pubkey) ?? undefined);
      if (!next.roles || holder === undefined) {
        if (role === 'Pauser' || role === 'OperationsAdmin') next.roles = undefined;
        continue;
      }
      if (role === 'Pauser') next.roles.pauser = holder;
      else if (role === 'OperationsAdmin') next.roles.operationsAdmin = holder;
    }
  }
  return next;
}

/**
 * Resolve the optional `roles` account an instruction passes (`Option<Account<
 * Roles>>` with `seeds = [b"roles"]`). Passing the program ID means "none",
 * which fails closed for every non-root signer. Passing the Roles PDA requires
 * it to exist, even for root. Anything else fails the seeds constraint.
 */
export function resolveRolesSlot(
  result: PreflightResult,
  facts: BridgeFacts,
  slot: string | undefined,
  programId: string,
  rolesPda: string
): Read<RolesFacts> {
  if (slot === undefined) {
    result.unverified.push('The roles account is missing from the instruction');
    return undefined;
  }
  if (slot === programId) return null;
  if (slot !== rolesPda) {
    reject(result, 'ConstraintSeeds', 'The roles account passed is not the Roles PDA');
    return undefined;
  }
  if (facts.roles === null) {
    reject(result, 'AccountNotInitialized', 'The Roles PDA is passed but has not been initialized');
    return undefined;
  }
  if (facts.roles === undefined) {
    result.unverified.push(
      'Roles could not be read — the passed Roles PDA must exist, even for a root signer'
    );
  }
  return facts.roles;
}

type Tier = 'root' | 'operations' | 'pauser';

/**
 * `require_root`, `require_operations_or_root` and
 * `require_pauser_or_operations_or_root` (auth.rs). Root always passes; with
 * no Roles (`null`) every other signer fails closed. `roles` is the result of
 * `resolveRolesSlot` for instructions that pass the account.
 */
export function checkAuthority(
  result: PreflightResult,
  facts: BridgeFacts,
  signer: string | undefined,
  tier: Tier,
  error: string,
  roles: Read<RolesFacts> = facts.roles
): void {
  if (!signer) {
    result.unverified.push('Signer account missing from the instruction — authority not verified');
    return;
  }
  if (facts.admin === undefined) {
    result.unverified.push('Bridge admin could not be read — authority not verified');
    return;
  }
  if (signer === facts.admin) return;
  if (tier === 'root') {
    reject(result, error, `Signer is not the bridge root admin (${facts.admin})`);
    return;
  }
  const allowed =
    tier === 'operations' ? 'root or operations admin' : 'root, operations admin or pauser';
  if (roles === undefined) {
    result.unverified.push(`Roles could not be resolved — cannot confirm the signer is ${allowed}`);
    return;
  }
  const isOperations = roles !== null && roles.operationsAdmin === signer;
  const isPauser = roles !== null && roles.pauser === signer;
  if (isOperations || (tier === 'pauser' && isPauser)) return;
  reject(
    result,
    error,
    roles === null
      ? `Signer is not root, and no Roles account is in effect to grant it ${allowed} rights`
      : `Signer is not the ${allowed}`
  );
}

/** `has_one = admin` on the recovery instructions fires before the handler. */
export function checkRootHasOne(
  result: PreflightResult,
  facts: BridgeFacts,
  signer: string | undefined
): void {
  checkAuthority(result, facts, signer, 'root', 'ConstraintHasOne');
}

/** An account the program derives from seeds must be exactly that PDA. */
export function checkPda(
  result: PreflightResult,
  supplied: string | undefined,
  expected: string | undefined,
  what: string
): void {
  if (!supplied || !expected) {
    result.unverified.push(`Could not confirm ${what} is the expected PDA`);
  } else if (supplied !== expected) {
    reject(result, 'ConstraintSeeds', `${what} is not the expected PDA (${expected})`);
  }
}

/** The recovery policy must exist and its mode must allow the action. */
export function checkRecoveryMode(
  result: PreflightResult,
  facts: BridgeFacts,
  action: 'cancel' | 'reverse'
): void {
  const mode = facts.recoveryMode;
  if (mode === undefined) {
    result.unverified.push('Recovery policy could not be read — recovery mode not verified');
    return;
  }
  if (mode === null) {
    reject(result, 'AccountNotInitialized', 'The recovery policy has not been initialized');
    return;
  }
  if (action === 'cancel' && mode !== 'CancellationOnly' && mode !== 'FullRecovery') {
    reject(
      result,
      'RecoveryPolicyDisabled',
      `Recovery mode is ${mode}; canceling needs Cancellation only or Full recovery`
    );
  }
  if (action === 'reverse' && mode !== 'FullRecovery') {
    reject(
      result,
      'ReversalPolicyDisabled',
      `Recovery mode is ${mode}; reversing needs Full recovery`
    );
  }
}

/** `config.paused || token_registry.paused`. */
export function checkRecoveryPause(
  result: PreflightResult,
  facts: BridgeFacts,
  registry: string | undefined
): void {
  const tokenPaused = registry ? facts.tokenPaused[registry] : undefined;
  if (facts.configPaused === true || tokenPaused === true) return;
  if (facts.configPaused === undefined || tokenPaused === undefined) {
    result.unverified.push('Pause state could not be read — the bridge or token must be paused');
    return;
  }
  reject(result, 'RecoveryRequiresPause', 'Neither the bridge nor this token is paused');
}

/** `!config.paused` and the `!token_registry.paused` constraint on payouts. */
export function checkUnpausedForPayout(
  result: PreflightResult,
  facts: BridgeFacts,
  registry: string | undefined
): void {
  if (facts.configPaused === true) reject(result, 'BridgePaused', 'The bridge is paused');
  else if (facts.configPaused === undefined) {
    result.unverified.push('Bridge pause state could not be read');
  }
  const tokenPaused = registry ? facts.tokenPaused[registry] : undefined;
  if (tokenPaused === true) reject(result, 'TokenPaused', 'This token is paused');
  else if (tokenPaused === undefined) result.unverified.push('Token pause state could not be read');
}

/** Non-zero incident ID and a reason code of at most 31. */
export function checkIncident(
  result: PreflightResult,
  reasonCode: unknown,
  incidentId: unknown
): void {
  const id = formatBytes32(incidentId);
  if (id === null) {
    result.unverified.push('Incident ID could not be decoded');
  } else if (/^0+$/.test(id)) {
    reject(result, 'InvalidIncidentId', 'The incident ID is all zeros');
  }
  const reason = toBigInt(reasonCode);
  if (reason === null) {
    result.unverified.push('Reason code could not be decoded');
  } else if (reason > BigInt(MAX_RECOVERY_REASON_CODE)) {
    reject(
      result,
      'InvalidRecoveryReason',
      `Reason code ${reason} is above ${MAX_RECOVERY_REASON_CODE}`
    );
  }
}

function chainPair(seq: unknown): number | null {
  const value = toBigInt(seq);
  return value === null ? null : Number(value >> BigInt(56)) & 0xff;
}

/**
 * `decode_chain_pair` (bridge_in_v2.rs) for an inbound sequence on this chain:
 * the top byte is `(source << 4) | dest`, dest must be this chain and source
 * must not be.
 */
export function checkInboundRoute(result: PreflightResult, facts: BridgeFacts, seq: unknown): void {
  const pair = chainPair(seq);
  if (pair === null) {
    result.unverified.push('Sequence could not be decoded');
    return;
  }
  if (pair === 0) {
    reject(result, 'InvalidDestinationChain', 'Legacy sequence carries no route');
    return;
  }
  if (facts.chainId === undefined) {
    result.unverified.push('Bridge chain ID could not be read — sequence route not verified');
    return;
  }
  if ((pair & 0x0f) !== facts.chainId) {
    reject(result, 'InvalidDestinationChain', 'The sequence is not addressed to this chain');
  } else if (((pair >> 4) & 0x0f) === facts.chainId) {
    reject(result, 'InvalidSourceChain', 'The sequence claims this chain as its source');
  }
}

/**
 * `cancellation_chain_pair` (post_cancellation_signatures.rs) for an outbound
 * sequence on this chain: source must be this chain and dest must not be.
 */
export function checkOutboundRoute(
  result: PreflightResult,
  facts: BridgeFacts,
  seq: unknown
): void {
  const pair = chainPair(seq);
  if (pair === null) {
    result.unverified.push('Sequence could not be decoded');
    return;
  }
  if (pair === 0) {
    reject(result, 'InvalidDestinationChain', 'Legacy sequence carries no route');
    return;
  }
  if (facts.chainId === undefined) {
    result.unverified.push('Bridge chain ID could not be read — sequence route not verified');
    return;
  }
  if (((pair >> 4) & 0x0f) !== facts.chainId) {
    reject(result, 'InvalidSourceChain', 'The sequence did not originate on this chain');
  } else if ((pair & 0x0f) === facts.chainId) {
    reject(result, 'InvalidDestinationChain', 'The sequence is addressed to this chain');
  }
}

/**
 * `init` targets and `require_empty_system_pda` both accept a system-owned,
 * zero-data account (anyone may prefund a PDA), so `occupied` must mean "owned
 * by a program or holding data", not merely "has lamports". `undefined` when
 * the check failed.
 */
export function checkAccountFree(
  result: PreflightResult,
  occupied: boolean | undefined,
  what: string,
  error = 'AccountAlreadyInUse'
): void {
  if (occupied === undefined) {
    result.unverified.push(`Could not check whether ${what} already exists`);
  } else if (occupied) {
    reject(result, error, `${what} already exists`);
  }
}

/** `set_token_limits`: max ≥ min unless either is 0 (unbounded). */
export function checkTokenLimits(
  result: PreflightResult,
  minAmount: unknown,
  maxAmount: unknown
): void {
  const min = toBigInt(minAmount);
  const max = toBigInt(maxAmount);
  if (min === null || max === null) {
    result.unverified.push('Limits could not be decoded');
    return;
  }
  if (max !== BigInt(0) && min !== BigInt(0) && max < min) {
    reject(result, 'InvalidAmountLimits', 'The maximum per transfer is below the minimum');
  }
}

/** A delivered transfer as read from its `IncomingMsg`. */
export interface IncomingFacts {
  processed: boolean;
  claimed: boolean;
  claimableAfter: bigint | null;
  /** The original sender, who is also the recipient on this chain. */
  sender: string | null;
  tokenMint: string | null;
}

/** Shared guards for acting on a held transfer. */
export function checkHeldTransfer(result: PreflightResult, incoming: Read<IncomingFacts>): void {
  if (incoming === undefined) {
    result.unverified.push('Incoming message could not be read — transfer state not verified');
    return;
  }
  if (incoming === null) {
    reject(result, 'AccountNotInitialized', 'No incoming message exists for this sequence');
    return;
  }
  if (!incoming.processed) {
    reject(result, 'InvalidDelayedTransfer', 'The transfer has not been delivered');
  }
  if (incoming.claimed) {
    reject(result, 'DelayedTransferAlreadyClaimed', 'The transfer has already been paid out');
  }
}

/**
 * Payout account constraints shared by `release_delayed_inbound` and
 * `settle_delayed`: the recipient is the original sender, the registry is the
 * transfer's token, and the mint passed is that token.
 */
export function checkPayoutAccounts(
  result: PreflightResult,
  incoming: Read<IncomingFacts>,
  accounts: { recipient?: string; tokenMint?: string; registryMint: string | null | undefined },
  registryMismatchError: string
): void {
  if (!incoming) return; // reported by checkHeldTransfer
  if (!accounts.recipient || incoming.sender === null) {
    result.unverified.push('Recipient could not be compared with the original sender');
  } else if (accounts.recipient !== incoming.sender) {
    reject(result, 'RecipientMismatch', 'The recipient is not the original sender');
  }
  if (!accounts.registryMint || incoming.tokenMint === null) {
    result.unverified.push('Token registry could not be compared with the transfer');
  } else if (accounts.registryMint !== incoming.tokenMint) {
    reject(result, registryMismatchError, 'The token registry is not this transfer’s token');
  }
  if (!accounts.tokenMint || !accounts.registryMint) {
    result.unverified.push('Mint account could not be compared with the registry');
  } else if (accounts.tokenMint !== accounts.registryMint) {
    reject(result, 'MintMismatch', 'The mint passed is not this token');
  }
}

/** `settle_delayed`: review off, not held, and the release time has passed. */
export function checkSettleable(
  result: PreflightResult,
  facts: BridgeFacts,
  incoming: Read<IncomingFacts>,
  nowSeconds: number
): void {
  if (facts.manualReviewEnabled === true) {
    reject(result, 'ManualHoldNotReleased', 'Manual review is enabled on this chain');
  } else if (facts.manualReviewEnabled === undefined) {
    result.unverified.push('Manual review state could not be read');
  }
  checkHeldTransfer(result, incoming);
  if (!incoming) return;
  if (incoming.claimableAfter === null) {
    result.unverified.push('Release time could not be read');
  } else if (incoming.claimableAfter === MANUAL_REVIEW_PENDING) {
    reject(result, 'ManualHoldNotReleased', 'The transfer is held for review with no release time');
  } else if (BigInt(nowSeconds) < incoming.claimableAfter) {
    reject(
      result,
      'DelayNotElapsed',
      'The release time has not passed yet (checked now; it may pass before execution)'
    );
  }
}

/** The fields of a `CancellationProof` that `reverse_outgoing` checks directly. */
export interface ProofFacts {
  consumed: boolean;
  sourceSeq: bigint | null;
  guardianSetIndex: number | null;
  signatureCount: number | null;
  destinationCancellation: string | null;
  reasonCode: number | null;
  incidentId: string | null;
}

/** `reverse_outgoing` proof checks (source_recovery.rs). */
export function checkCancellationProof(
  result: PreflightResult,
  proof: Read<ProofFacts>,
  expected: {
    seq: unknown;
    destinationCancellation: string | undefined;
    reasonCode: unknown;
    incidentId: unknown;
  },
  guardianSet: { index: number | null; threshold: number | null } | undefined
): void {
  if (proof === undefined) {
    result.unverified.push('Cancellation proof could not be read');
    return;
  }
  if (proof === null) {
    reject(
      result,
      'AccountNotInitialized',
      'No cancellation proof exists at the given account — post the guardian signatures first'
    );
    return;
  }
  if (proof.consumed) {
    reject(result, 'CancellationProofConsumed', 'This cancellation proof has already been used');
  }

  if (!guardianSet || guardianSet.index === null || proof.guardianSetIndex === null) {
    result.unverified.push('Guardian set index could not be compared with the proof');
  } else if (proof.guardianSetIndex !== guardianSet.index) {
    reject(result, 'StaleGuardianSet', 'The proof was signed by a previous guardian set');
  }
  if (!guardianSet || guardianSet.threshold === null || proof.signatureCount === null) {
    result.unverified.push('Proof signature count could not be compared with the threshold');
  } else if (proof.signatureCount < guardianSet.threshold) {
    reject(
      result,
      'InvalidSignatures',
      `The proof has ${proof.signatureCount} of ${guardianSet.threshold} required guardian signatures`
    );
  }

  const seq = toBigInt(expected.seq);
  if (seq === null || proof.sourceSeq === null) {
    result.unverified.push('Sequence could not be compared with the proof');
  } else if (seq !== proof.sourceSeq) {
    reject(result, 'InvalidCancellationProof', 'The proof is for a different sequence');
  }

  if (!expected.destinationCancellation || proof.destinationCancellation === null) {
    result.unverified.push('Destination cancellation could not be compared with the proof');
  } else if (expected.destinationCancellation !== proof.destinationCancellation) {
    reject(
      result,
      'InvalidDestinationCancellation',
      'The destination cancellation does not match the proof'
    );
  }

  const reason = toBigInt(expected.reasonCode);
  const incident = formatBytes32(expected.incidentId);
  if (reason === null || incident === null || proof.reasonCode === null || !proof.incidentId) {
    result.unverified.push('Reason code and incident ID could not be compared with the proof');
  } else if (Number(reason) !== proof.reasonCode || incident !== proof.incidentId) {
    reject(
      result,
      'InvalidCancellationProof',
      'The reason code or incident ID does not match the proof'
    );
  }
}

/**
 * Apply earlier instructions in the proposal that act on the same inbound
 * sequence: `set_delayed_release_maturity` moves `claimable_after`, and
 * `release_delayed_inbound` / `settle_delayed` pay it out. A value that cannot
 * be decoded makes the affected field unknown.
 */
export function applyPriorIncomingEffects(
  incoming: Read<IncomingFacts>,
  prior: DecodedInstruction[] | undefined,
  programId: string,
  sourceSeq: unknown
): Read<IncomingFacts> {
  const seq = toBigInt(sourceSeq);
  if (!incoming || seq === null) return incoming;
  let next: IncomingFacts = { ...incoming };
  for (const ix of prior ?? []) {
    if (ix.programId !== programId || toBigInt(ix.args?.source_seq) !== seq) continue;
    if (instructionIs(ix, programId, 'set_delayed_release_maturity')) {
      next = { ...next, claimableAfter: toBigInt(ix.args?.release_at) };
    } else if (
      instructionIs(ix, programId, 'release_delayed_inbound') ||
      instructionIs(ix, programId, 'settle_delayed')
    ) {
      next = { ...next, claimed: true };
    }
  }
  return next;
}

/**
 * An earlier `post_cancellation_signatures` for the same sequence creates the
 * proof a later `reverse_outgoing` consumes, so the proof cannot be read from
 * chain yet. Its incident fields must still match.
 */
export function findPriorProofPost(
  prior: DecodedInstruction[] | undefined,
  programId: string,
  seq: unknown
): DecodedInstruction | undefined {
  const value = toBigInt(seq);
  if (value === null) return undefined;
  return (prior ?? []).find(
    (ix) =>
      instructionIs(ix, programId, 'post_cancellation_signatures') &&
      toBigInt(ix.args?.source_seq) === value
  );
}

export function checkPriorProofPost(
  result: PreflightResult,
  post: DecodedInstruction,
  expected: { reasonCode: unknown; incidentId: unknown }
): void {
  const reason = toBigInt(expected.reasonCode);
  const postedReason = toBigInt(post.args?.reason_code);
  const incident = formatBytes32(expected.incidentId);
  const postedIncident = formatBytes32(post.args?.incident_id);
  if (reason === null || postedReason === null || !incident || !postedIncident) {
    result.unverified.push(
      'Reason code and incident ID could not be compared with the proof posted earlier'
    );
  } else if (reason !== postedReason || incident !== postedIncident) {
    reject(
      result,
      'InvalidCancellationProof',
      'The reason code or incident ID differs from the proof posted earlier in this proposal'
    );
  }
  result.unverified.push(
    'The proof is posted by an earlier instruction in this proposal; its guardian signatures, threshold and address are not simulated'
  );
}
