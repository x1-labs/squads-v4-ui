/**
 * Shared shape for instruction preflight checks: why a program would reject a
 * proposal, and which checks could not run. Program-specific guards live in
 * `vesting/preflight.ts` and `warpBridge/preflight.ts`.
 */

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

export function willFail(result: PreflightResult): boolean {
  return result.rejections.length > 0;
}

/**
 * Proposal states in which the transaction can no longer run as proposed:
 * once executed (or executing), its own effects are on chain, and rejected or
 * cancelled proposals never execute. Preflight only applies to the rest.
 */
const FINAL_PROPOSAL_STATUSES = new Set(['Executing', 'Executed', 'Cancelled', 'Rejected']);

export function isFinalProposalStatus(status: string | undefined): boolean {
  return status !== undefined && FINAL_PROPOSAL_STATUSES.has(status);
}
