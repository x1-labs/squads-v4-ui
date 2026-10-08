import { useEffect, useState } from 'react';
import type * as multisig from '@sqds/multisig';
import { useMultisig } from './useServices';
import {
  executableAt,
  nextSecondDelay,
  timeLockRemaining,
  timeLockTimerDelay,
} from '@/lib/timeLock';

export type TimeLockStatus = {
  /** True while an Approved proposal must still wait for the time lock. */
  locked: boolean;
  /** Current only with `countdown`; otherwise it can be out of date. */
  remainingSeconds: number;
  /** Unix seconds when the proposal can execute, or null if it is not Approved. */
  executableAt: number | null;
};

/**
 * Time lock state of a proposal under the selected multisig. With `countdown`,
 * the caller re-renders every second while the proposal is locked. Without it,
 * the caller re-renders once, when the time lock releases. Uses the browser
 * clock; the program uses the cluster clock, which can differ by a few seconds.
 */
export function useTimeLockStatus(
  proposal: multisig.generated.Proposal | null | undefined,
  { countdown = false }: { countdown?: boolean } = {}
): TimeLockStatus {
  const { data: multisigConfig } = useMultisig();
  const timeLock = multisigConfig?.timeLock ?? 0;
  const approvedTimestamp =
    proposal?.status.__kind === 'Approved' ? Number(proposal.status.timestamp.toString()) : null;

  const [now, setNow] = useState(() => Date.now() / 1000);
  const remaining =
    approvedTimestamp === null ? 0 : timeLockRemaining(approvedTimestamp, timeLock, now);

  const locked = remaining > 0;

  // `now` is a dependency, so each timer sets the next one while still locked.
  useEffect(() => {
    if (!locked || approvedTimestamp === null) return;
    const nowMs = Date.now();
    const delay = countdown
      ? nextSecondDelay(nowMs)
      : timeLockTimerDelay(approvedTimestamp, timeLock, nowMs);
    const id = setTimeout(() => setNow(Date.now() / 1000), delay);
    return () => clearTimeout(id);
  }, [countdown, locked, approvedTimestamp, timeLock, now]);

  return {
    locked,
    remainingSeconds: remaining,
    executableAt: approvedTimestamp === null ? null : executableAt(approvedTimestamp, timeLock),
  };
}
