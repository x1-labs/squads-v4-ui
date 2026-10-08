/** The program's MAX_TIME_LOCK (state/multisig.rs): 3 months, in seconds. */
export const MAX_TIME_LOCK_SECONDS = 3 * 30 * 24 * 60 * 60;

export const TIME_LOCK_UNITS = {
  minutes: 60,
  hours: 60 * 60,
  days: 24 * 60 * 60,
} as const;

export type TimeLockUnit = keyof typeof TIME_LOCK_UNITS;

/**
 * Converts the form input to whole seconds for `SetTimeLock`. Returns an error
 * message for input the program would reject or that is not a number.
 */
export function parseTimeLockInput(
  value: string,
  unit: TimeLockUnit
): { seconds: number } | { error: string } {
  const trimmed = value.trim();
  if (!/^\d+(\.\d+)?$/.test(trimmed)) {
    return { error: 'Enter a number of zero or more.' };
  }
  const seconds = Math.round(Number(trimmed) * TIME_LOCK_UNITS[unit]);
  if (seconds > MAX_TIME_LOCK_SECONDS) {
    return { error: `Time lock cannot exceed ${formatDuration(MAX_TIME_LOCK_SECONDS)}.` };
  }
  return { seconds };
}

/**
 * Unix time (seconds) at which an Approved proposal can execute. The program
 * requires `now - approved_timestamp >= time_lock` (vault_transaction_execute.rs).
 */
export function executableAt(approvedTimestamp: bigint | number, timeLock: number): number {
  return Number(approvedTimestamp) + timeLock;
}

/** Seconds left before an Approved proposal can execute; 0 when it can execute now. */
export function timeLockRemaining(
  approvedTimestamp: bigint | number,
  timeLock: number,
  nowSeconds: number
): number {
  return Math.max(0, executableAt(approvedTimestamp, timeLock) - Math.floor(nowSeconds));
}

/** Longest delay `setTimeout` supports (2^31 - 1 ms, about 24.8 days). A longer delay fires at once. */
export const MAX_TIMEOUT_MS = 2 ** 31 - 1;

/**
 * Delay for a timer that fires when the time lock releases: the milliseconds
 * until the proposal can execute, capped at MAX_TIMEOUT_MS. A capped timer
 * fires before the release, so the caller must check again and set a new timer.
 */
export function timeLockTimerDelay(
  approvedTimestamp: bigint | number,
  timeLock: number,
  nowMs: number
): number {
  const remainingMs = executableAt(approvedTimestamp, timeLock) * 1000 - nowMs;
  return Math.min(MAX_TIMEOUT_MS, Math.max(0, remainingMs));
}

/** Milliseconds until the next whole second, when `timeLockRemaining` changes next. */
export function nextSecondDelay(nowMs: number): number {
  return 1000 - (nowMs % 1000);
}

/** Short duration such as "2 d 3 h", "45 min" or "30 s". Zero is "None". */
export function formatDuration(totalSeconds: number): string {
  if (totalSeconds <= 0) return 'None';
  const days = Math.floor(totalSeconds / 86_400);
  const hours = Math.floor((totalSeconds % 86_400) / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;
  const parts: string[] = [];
  if (days) parts.push(`${days} d`);
  if (hours) parts.push(`${hours} h`);
  if (minutes && !days) parts.push(`${minutes} min`);
  if (seconds && !days && !hours) parts.push(`${seconds} s`);
  return parts.join(' ');
}

/** Compact countdown for buttons: the two largest units, such as "1d 3h", "2h 15m" or "8m 41s". */
export function formatCountdown(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const units: [number, string][] = [
    [Math.floor(s / 86_400), 'd'],
    [Math.floor((s % 86_400) / 3_600), 'h'],
    [Math.floor((s % 3_600) / 60), 'm'],
    [s % 60, 's'],
  ];
  const first = units.findIndex(([n]) => n > 0);
  if (first === -1) return '0s';
  return units
    .slice(first, first + 2)
    .filter(([n]) => n > 0)
    .map(([n, unit]) => `${n}${unit}`)
    .join(' ');
}
