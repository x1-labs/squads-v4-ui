import { useEffect, useState } from 'react';
import type * as multisig from '@sqds/multisig';
import { useMultisig } from './useServices';
import { executableAt, timeLockRemaining } from '@/lib/timeLock';

export type TimeLockStatus = {
  /** True while an Approved proposal must still wait for the time lock. */
  locked: boolean;
  remainingSeconds: number;
  /** Unix seconds when the proposal can execute, or null if it is not Approved. */
  executableAt: number | null;
};

/**
 * Time lock state of a proposal under the selected multisig. Updates every
 * second while the proposal is locked. Uses the browser clock; the program
 * uses the cluster clock, which can differ by a few seconds.
 */
export function useTimeLockStatus(
  proposal: multisig.generated.Proposal | null | undefined
): TimeLockStatus {
  const { data: multisigConfig } = useMultisig();
  const timeLock = multisigConfig?.timeLock ?? 0;
  const approvedTimestamp =
    proposal?.status.__kind === 'Approved' ? Number(proposal.status.timestamp.toString()) : null;

  const [now, setNow] = useState(() => Date.now() / 1000);
  const remaining =
    approvedTimestamp === null ? 0 : timeLockRemaining(approvedTimestamp, timeLock, now);

  const locked = remaining > 0;

  useEffect(() => {
    if (!locked) return;
    const id = setInterval(() => setNow(Date.now() / 1000), 1000);
    return () => clearInterval(id);
  }, [locked]);

  return {
    locked,
    remainingSeconds: remaining,
    executableAt: approvedTimestamp === null ? null : executableAt(approvedTimestamp, timeLock),
  };
}
