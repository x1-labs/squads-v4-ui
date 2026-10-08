import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_TIMEOUT_MS,
  MAX_TIME_LOCK_SECONDS,
  executableAt,
  formatCountdown,
  formatDuration,
  nextSecondDelay,
  parseTimeLockInput,
  timeLockRemaining,
  timeLockTimerDelay,
} from './timeLock.ts';

describe('parseTimeLockInput', () => {
  test('converts each unit to seconds', () => {
    assert.deepEqual(parseTimeLockInput('10', 'minutes'), { seconds: 600 });
    assert.deepEqual(parseTimeLockInput('24', 'hours'), { seconds: 86_400 });
    assert.deepEqual(parseTimeLockInput('2', 'days'), { seconds: 172_800 });
  });

  test('accepts fractions and rounds to whole seconds', () => {
    assert.deepEqual(parseTimeLockInput('1.5', 'hours'), { seconds: 5_400 });
    assert.deepEqual(parseTimeLockInput('0.01', 'minutes'), { seconds: 1 });
  });

  test('zero removes the time lock', () => {
    assert.deepEqual(parseTimeLockInput('0', 'hours'), { seconds: 0 });
  });

  test('accepts the program maximum and rejects anything above it', () => {
    assert.deepEqual(parseTimeLockInput('90', 'days'), { seconds: MAX_TIME_LOCK_SECONDS });
    assert.ok('error' in parseTimeLockInput('90.0001', 'days'));
  });

  test('rejects input that is not a non-negative number', () => {
    for (const bad of ['', ' ', '-1', 'abc', '1e3', '1,5', '.5']) {
      assert.ok('error' in parseTimeLockInput(bad, 'hours'), bad);
    }
  });
});

describe('executableAt and timeLockRemaining', () => {
  const approved = 1_760_000_000;

  test('the proposal can execute exactly time_lock seconds after approval', () => {
    assert.equal(executableAt(approved, 3_600), approved + 3_600);
    assert.equal(timeLockRemaining(approved, 3_600, approved + 3_599), 1);
    assert.equal(timeLockRemaining(approved, 3_600, approved + 3_600), 0);
  });

  test('never negative after the time lock has passed', () => {
    assert.equal(timeLockRemaining(approved, 60, approved + 10_000), 0);
  });

  test('no time lock means it can execute at once', () => {
    assert.equal(timeLockRemaining(approved, 0, approved), 0);
  });

  test('accepts the bigint timestamp the SDK returns and a fractional now', () => {
    assert.equal(timeLockRemaining(BigInt(approved), 60, approved + 30.9), 30);
  });
});

describe('timeLockTimerDelay', () => {
  const approved = 1_760_000_000;
  const releaseMs = (approved + 600) * 1000;

  test('fires at the release time', () => {
    assert.equal(timeLockTimerDelay(approved, 600, approved * 1000), 600_000);
    assert.equal(timeLockTimerDelay(BigInt(approved), 600, releaseMs - 250), 250);
  });

  test('is 0 exactly when timeLockRemaining is 0', () => {
    assert.equal(timeLockTimerDelay(approved, 600, releaseMs - 1), 1);
    assert.equal(timeLockRemaining(approved, 600, (releaseMs - 1) / 1000), 1);
    assert.equal(timeLockTimerDelay(approved, 600, releaseMs), 0);
    assert.equal(timeLockRemaining(approved, 600, releaseMs / 1000), 0);
  });

  test('never negative after the release', () => {
    assert.equal(timeLockTimerDelay(approved, 600, releaseMs + 10_000), 0);
  });

  test('caps a long time lock at the setTimeout maximum', () => {
    assert.ok(MAX_TIME_LOCK_SECONDS * 1000 > MAX_TIMEOUT_MS);
    assert.equal(
      timeLockTimerDelay(approved, MAX_TIME_LOCK_SECONDS, approved * 1000),
      MAX_TIMEOUT_MS
    );
  });
});

describe('nextSecondDelay', () => {
  test('waits for the next whole second', () => {
    assert.equal(nextSecondDelay(1_760_000_000_250), 750);
    assert.equal(nextSecondDelay(1_760_000_000_999), 1);
    assert.equal(nextSecondDelay(1_760_000_000_000), 1000);
  });

  test('the countdown tick lands on the release time', () => {
    const approved = 1_760_000_000;
    const nowMs = (approved + 599) * 1000 + 400;
    const delay = nextSecondDelay(nowMs);
    assert.equal(delay, timeLockTimerDelay(approved, 600, nowMs));
    assert.equal(timeLockRemaining(approved, 600, (nowMs + delay) / 1000), 0);
  });
});

describe('formatDuration', () => {
  test('zero and below is None', () => {
    assert.equal(formatDuration(0), 'None');
    assert.equal(formatDuration(-5), 'None');
  });

  test('picks the two largest useful units', () => {
    assert.equal(formatDuration(30), '30 s');
    assert.equal(formatDuration(600), '10 min');
    assert.equal(formatDuration(5_400), '1 h 30 min');
    assert.equal(formatDuration(86_400), '1 d');
    assert.equal(formatDuration(97_200), '1 d 3 h');
    assert.equal(formatDuration(MAX_TIME_LOCK_SECONDS), '90 d');
  });
});

describe('formatCountdown', () => {
  test('shows the two largest units, compact', () => {
    assert.equal(formatCountdown(521), '8m 41s');
    assert.equal(formatCountdown(8_100), '2h 15m');
    assert.equal(formatCountdown(97_200), '1d 3h');
    assert.equal(formatCountdown(41), '41s');
  });

  test('skips a zero second unit', () => {
    assert.equal(formatCountdown(7_200), '2h');
    assert.equal(formatCountdown(86_430), '1d');
  });

  test('zero and below is 0s', () => {
    assert.equal(formatCountdown(0), '0s');
    assert.equal(formatCountdown(-3), '0s');
  });
});
