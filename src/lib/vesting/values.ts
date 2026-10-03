/**
 * Value helpers for vesting instruction data and account state.
 *
 * Kept free of JSON, React and path-alias imports so the schedule rules can be
 * unit tested against the program's own vectors.
 */
import { enumVariantName, toBigInt } from '../utils/anchorValues';

export { toBigInt, toNumber, enumVariantName } from '../utils/anchorValues';

/** Months from `start_ts` to the cliff and to the end under the Monthly schedule. */
export const MONTHLY_CLIFF_MONTHS = 12;
export const MONTHLY_TOTAL_MONTHS = 48;

/** Largest |unix seconds| a JS Date can represent (±100,000,000 days). */
const MAX_DATE_SECONDS = BigInt(8_640_000_000_000);

export type ScheduleName = 'Linear' | 'Monthly';

/** Normalize a decoded `PrincipalSchedule` (`{ Monthly: {} }`) to its name. */
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

/** Whether a unix timestamp can be represented as a JS Date. */
export function isDateRepresentable(seconds: bigint): boolean {
  return seconds >= -MAX_DATE_SECONDS && seconds <= MAX_DATE_SECONDS;
}

/**
 * Midnight UTC of a civil date, in seconds. Uses setUTCFullYear because
 * Date.UTC maps years 0–99 to 1900–1999.
 */
function utcMidnight(year: number, month: number, day: number): number {
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  return date.getTime() / 1000;
}

function daysInMonth(year: number, month: number): number {
  // month is 1-based; day 0 of the next month is the last day of this one.
  const date = new Date(0);
  date.setUTCFullYear(year, month, 0);
  return date.getUTCDate();
}

/**
 * Add calendar months to a unix timestamp the way the program does: keep the
 * UTC day and time of day, and clamp to the last day of a shorter target month
 * (Jan 31 + 1 month = Feb 28/29). Mirrors `add_calendar_months` in
 * `programs/vesting/src/instructions/common.rs`. Returns NaN when the input or
 * result is outside the range a JS Date can represent.
 */
export function addCalendarMonths(timestamp: number, months: number): number {
  const date = new Date(timestamp * 1000);
  if (Number.isNaN(date.getTime())) return NaN;
  const year = date.getUTCFullYear();
  const monthIndex = date.getUTCMonth() + months;
  const targetYear = year + Math.floor(monthIndex / 12);
  const targetMonth = (((monthIndex % 12) + 12) % 12) + 1;
  const day = Math.min(date.getUTCDate(), daysInMonth(targetYear, targetMonth));
  const secondsIntoDay =
    date.getUTCHours() * 3600 + date.getUTCMinutes() * 60 + date.getUTCSeconds();

  return utcMidnight(targetYear, targetMonth, day) + secondsIntoDay;
}

export type ScheduleCheck =
  | { status: 'valid' }
  | { status: 'invalid'; problem: string }
  | { status: 'unverified'; problem: string };

/**
 * Apply the program's `validate_schedule` rules to a proposed grant, so a
 * reviewer sees a doomed proposal before it is executed. Ordering uses bigint
 * so any i64 is compared exactly; the Monthly calendar rule is only evaluated
 * for timestamps a JS Date can represent.
 */
export function checkGrantSchedule(
  schedule: ScheduleName | null,
  startTs: bigint,
  cliffTs: bigint,
  endTs: bigint
): ScheduleCheck {
  if (!(startTs < endTs)) return { status: 'invalid', problem: 'start must be before end' };
  if (!(startTs <= cliffTs && cliffTs <= endTs)) {
    return { status: 'invalid', problem: 'cliff must fall between start and end' };
  }
  if (schedule === null) {
    return { status: 'unverified', problem: 'treasury schedule could not be read' };
  }
  if (schedule === 'Monthly') {
    if (![startTs, cliffTs, endTs].every(isDateRepresentable)) {
      return {
        status: 'unverified',
        problem: 'timestamps are outside the range this page can check',
      };
    }
    const start = Number(startTs);
    const expectedCliff = addCalendarMonths(start, MONTHLY_CLIFF_MONTHS);
    const expectedEnd = addCalendarMonths(start, MONTHLY_TOTAL_MONTHS);
    if (!Number.isFinite(expectedCliff) || !Number.isFinite(expectedEnd)) {
      return {
        status: 'unverified',
        problem: 'timestamps are outside the range this page can check',
      };
    }
    if (Number(cliffTs) !== expectedCliff) {
      return {
        status: 'invalid',
        problem: 'Monthly grants need cliff = start + 12 calendar months',
      };
    }
    if (Number(endTs) !== expectedEnd) {
      return { status: 'invalid', problem: 'Monthly grants need end = start + 48 calendar months' };
    }
  }
  return { status: 'valid' };
}

const pad = (value: number, width = 2) => String(value).padStart(width, '0');

/**
 * Render a unix timestamp as `YYYY-MM-DD HH:MM UTC`. Never throws: values a
 * Date cannot represent are shown raw, so one odd argument cannot take down
 * the whole proposal page. Years past 9999 are labelled, because they usually
 * mean milliseconds were entered where seconds belong.
 */
export function formatTimestamp(value: unknown): string {
  const seconds = toBigInt(value);
  if (seconds === null) return '—';
  if (!isDateRepresentable(seconds)) return `${seconds.toString()} (out of range)`;
  const date = new Date(Number(seconds) * 1000);
  const year = date.getUTCFullYear();
  const yearText = year < 0 ? `-${pad(-year, 4)}` : pad(year, 4);
  const text = `${yearText}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ${pad(
    date.getUTCHours()
  )}:${pad(date.getUTCMinutes())} UTC`;
  return year > 9999 ? `${text} (year ${year} — milliseconds instead of seconds?)` : text;
}
