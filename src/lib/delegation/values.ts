/**
 * Value helpers specific to the delegation program. Generic Anchor decoding
 * helpers live in `@/lib/utils/anchorValues`.
 */
export { toBigInt, toNumber, enumVariantName, percentChange } from '../utils/anchorValues';

import { toNumber } from '../utils/anchorValues';

/**
 * Render a validator version packed by the program as
 * `major * 1_000_000 + minor * 1_000 + patch`.
 */
export function formatValidatorVersion(packed: number | null | undefined): string {
  if (packed === null || packed === undefined || !Number.isFinite(packed)) return '—';

  const major = Math.floor(packed / 1_000_000);
  const minor = Math.floor(packed / 1_000) % 1_000;
  const patch = packed % 1_000;

  return `${major}.${minor}.${patch}`;
}

/**
 * Format a basis-points stake multiplier (10000 bps = 100%).
 */
export function formatBasisPoints(bps: number | null | undefined): string {
  if (bps === null || bps === undefined || !Number.isFinite(bps)) return '—';
  return `${(bps / 100).toLocaleString(undefined, { maximumFractionDigits: 2 })}%`;
}

/**
 * Human labels for the `DelegationCriterion` enum, plus what failing the
 * criterion means for the validator.
 */
export const DELEGATION_CRITERIA: Record<string, { label: string; description: string }> = {
  MaxCommission: {
    label: 'Commission too high',
    description: 'Commission exceeds the configured maximum',
  },
  MinSelfStake: {
    label: 'Self-stake too low',
    description: 'Validator self-stake is below the required minimum',
  },
  MaxTotalStake: {
    label: 'Total stake too high',
    description: 'Validator holds more stake than the per-validator cap',
  },
  MinVoteCredits: {
    label: 'Vote credits too low',
    description: 'Vote credits are below the threshold vs. the cluster average',
  },
  MaxSkipRate: {
    label: 'Skip rate too high',
    description: 'Skip rate exceeds the tolerance above the cluster average',
  },
  MinValidatorVersion: {
    label: 'Version too old',
    description: 'Validator is running below the minimum required version',
  },
  Delinquent: {
    label: 'Delinquent',
    description: 'Validator is not voting',
  },
  NoVersionInfo: {
    label: 'No version reported',
    description: 'Validator does not report a version over gossip',
  },
  NotValidator: {
    label: 'Not an active validator',
    description: 'Vote account is not part of the active validator set',
  },
  MaxTotalStakePercent: {
    label: 'Network share too high',
    description: 'Validator controls more than the allowed share of network stake',
  },
};

/**
 * Human labels for the `ValidatorStatus` enum.
 */
export const VALIDATOR_STATUSES: Record<string, { label: string; description: string }> = {
  Pending: {
    label: 'Pending',
    description: 'Awaiting review — not yet eligible for delegation',
  },
  Approved: {
    label: 'Approved',
    description: 'Eligible to receive stake from the delegation program',
  },
  Rejected: {
    label: 'Rejected',
    description: 'Not eligible to receive stake from the delegation program',
  },
};
