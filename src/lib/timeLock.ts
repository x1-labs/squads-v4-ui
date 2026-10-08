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
