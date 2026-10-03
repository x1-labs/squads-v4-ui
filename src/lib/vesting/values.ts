/**
 * Value helpers for vesting instruction data and account state.
 *
 * Kept free of JSON and React imports so the schedule rules can be unit tested
 * against the program's own vectors.
 */
import { enumVariantName, toBigInt } from '../utils/anchorValues';

export { toBigInt, toNumber, enumVariantName } from '../utils/anchorValues';

const SECONDS_PER_DAY = 86_400;

/** Months from `start_ts` to the cliff and to the end under the Monthly schedule. */
export const MONTHLY_CLIFF_MONTHS = 12;
export const MONTHLY_TOTAL_MONTHS = 48;

export type ScheduleName = 'Linear' | 'Monthly';

/** Normalize a decoded `PrincipalSchedule` (`{ monthly: {} }`) to its name. */
export function scheduleName(value: unknown): ScheduleName | null {
  const name = enumVariantName(value);
  return name === 'Linear' || name === 'Monthly' ? name : null;
}

/** One-line description of how principal unlocks under a schedule. */
export function describeSchedule(schedule: ScheduleName | null): string {
  if (schedule === 'Monthly') {
    return '25% at the 12-month cliff, then 1/48 on each monthly anniversary until month 48';
  }
  if (schedule === 'Linear') {
    return 'Accrues continuously from start to end; nothing is claimable before the cliff';
  }
  return 'Unknown schedule';
}

function daysInMonth(year: number, month: number): number {
  // month is 1-based; day 0 of the next month is the last day of this one.
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * Add calendar months to a unix timestamp the way the program does: keep the
 * UTC day and time of day, and clamp to the last day of a shorter target month
 * (Jan 31 + 1 month = Feb 28/29). Mirrors `add_calendar_months` in
 * `programs/vesting/src/instructions/common.rs`.
 */
export function addCalendarMonths(timestamp: number, months: number): number {
  const date = new Date(timestamp * 1000);
  const year = date.getUTCFullYear();
  const monthIndex = date.getUTCMonth() + months;
  const targetYear = year + Math.floor(monthIndex / 12);
  const targetMonth = (((monthIndex % 12) + 12) % 12) + 1;
  const day = Math.min(date.getUTCDate(), daysInMonth(targetYear, targetMonth));
  const secondsIntoDay =
    date.getUTCHours() * 3600 + date.getUTCMinutes() * 60 + date.getUTCSeconds();

  return Date.UTC(targetYear, targetMonth - 1, day) / 1000 + secondsIntoDay;
}

export interface ScheduleCheck {
  valid: boolean;
  /** Why `create_grant` would reject these timestamps, when it would. */
  problem?: string;
}

/**
 * Apply the program's `validate_schedule` rules to a proposed grant, so a
 * reviewer sees a doomed proposal before it is executed.
 */
export function checkGrantSchedule(
  schedule: ScheduleName | null,
  startTs: number,
  cliffTs: number,
  endTs: number
): ScheduleCheck {
  if (!(startTs < endTs)) return { valid: false, problem: 'start must be before end' };
  if (!(startTs <= cliffTs && cliffTs <= endTs)) {
    return { valid: false, problem: 'cliff must fall between start and end' };
  }
  if (schedule === 'Monthly') {
    if (cliffTs !== addCalendarMonths(startTs, MONTHLY_CLIFF_MONTHS)) {
      return { valid: false, problem: 'Monthly grants need cliff = start + 12 calendar months' };
    }
    if (endTs !== addCalendarMonths(startTs, MONTHLY_TOTAL_MONTHS)) {
      return { valid: false, problem: 'Monthly grants need end = start + 48 calendar months' };
    }
  }
  return { valid: true };
}

/** Render a unix timestamp as `YYYY-MM-DD HH:MM UTC`. */
export function formatTimestamp(value: unknown): string {
  const seconds = toBigInt(value);
  if (seconds === null) return '—';
  const iso = new Date(Number(seconds) * 1000).toISOString();
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`;
}

/** Whole days between two unix timestamps, for "cliff in N days" style hints. */
export function daysBetween(fromTs: number, toTs: number): number {
  return Math.round((toTs - fromTs) / SECONDS_PER_DAY);
}

/**
 * Format lamports as an exact native amount with every significant decimal —
 * multisig reviewers approving a grant need the precise figure, not a rounded
 * one.
 */
export function formatExactNative(lamports: unknown, symbol: string): string {
  const raw = toBigInt(lamports);
  if (raw === null) return '—';
  const negative = raw < BigInt(0);
  const abs = negative ? -raw : raw;
  const whole = abs / BigInt(1_000_000_000);
  const fraction = (abs % BigInt(1_000_000_000)).toString().padStart(9, '0').replace(/0+$/, '');
  const sign = negative ? '-' : '';
  return `${sign}${whole.toLocaleString('en-US')}${fraction ? `.${fraction}` : ''} ${symbol}`;
}
