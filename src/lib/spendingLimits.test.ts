import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { Keypair, PublicKey } from '@solana/web3.js';
import * as multisig from '@sqds/multisig';
import {
  NATIVE_MINT_KEY,
  isNativeMint,
  normalizeKeys,
  parseAddressList,
  parseTokenAmount,
  removedMembers,
  spendingLimitAccountsForActions,
  spendingLimitState,
  validateSpend,
} from './spendingLimits.ts';

const { Period } = multisig.types;
const DAY = 86_400;

const key = (byte: number) => new PublicKey(new Uint8Array(32).fill(byte));

describe('parseTokenAmount', () => {
  test('converts token units to base units with the mint decimals', () => {
    assert.deepEqual(parseTokenAmount('1', 9), { amount: 1_000_000_000n });
    assert.deepEqual(parseTokenAmount('1.5', 6), { amount: 1_500_000n });
    assert.deepEqual(parseTokenAmount('0.000000001', 9), { amount: 1n });
    assert.deepEqual(parseTokenAmount('42', 0), { amount: 42n });
  });

  test('keeps full precision above 2^53', () => {
    assert.deepEqual(parseTokenAmount('18446744073.709551615', 9), {
      amount: 18_446_744_073_709_551_615n,
    });
  });

  test('rejects values above u64 max', () => {
    assert.ok('error' in parseTokenAmount('18446744073.709551616', 9));
  });

  test('rejects more decimal places than the mint has', () => {
    assert.ok('error' in parseTokenAmount('0.0000000001', 9));
    assert.ok('error' in parseTokenAmount('1.5', 0));
  });

  test('rejects zero and input that is not a plain positive number', () => {
    for (const bad of ['', ' ', '0', '0.000', '-1', 'abc', '1e3', '1,5', '.5', '1.']) {
      assert.ok('error' in parseTokenAmount(bad, 9), bad);
    }
  });

  test('ignores surrounding white space', () => {
    assert.deepEqual(parseTokenAmount(' 2 ', 2), { amount: 200n });
  });
});

describe('spendingLimitState', () => {
  const lastReset = 1_760_000_000;
  const base = { amount: 1_000n, remainingAmount: 300n, lastReset, period: Period.Day };

  test('inside the period the stored remaining amount applies', () => {
    assert.deepEqual(spendingLimitState(base, lastReset + 10), {
      remaining: 300n,
      nextReset: lastReset + DAY,
    });
  });

  test('exactly one period after last_reset there is no reset yet', () => {
    assert.deepEqual(spendingLimitState(base, lastReset + DAY), {
      remaining: 300n,
      nextReset: lastReset + DAY,
    });
  });

  test('one second past the period the pool resets to the full amount', () => {
    assert.deepEqual(spendingLimitState(base, lastReset + DAY + 1), {
      remaining: 1_000n,
      nextReset: lastReset + 2 * DAY,
    });
  });

  test('several periods passed moves last_reset forward by whole periods', () => {
    // passed = 3.5 days, so periods_passed = 3 and last_reset moves 3 days.
    assert.deepEqual(spendingLimitState(base, lastReset + 3.5 * DAY), {
      remaining: 1_000n,
      nextReset: lastReset + 4 * DAY,
    });
  });

  test('exactly two periods passed resets and moves last_reset to now', () => {
    assert.deepEqual(spendingLimitState(base, lastReset + 2 * DAY), {
      remaining: 1_000n,
      nextReset: lastReset + 3 * DAY,
    });
  });

  test('week and month use 7 and 30 days', () => {
    const week = { ...base, period: Period.Week };
    assert.equal(spendingLimitState(week, lastReset).nextReset, lastReset + 7 * DAY);
    assert.equal(spendingLimitState(week, lastReset + 7 * DAY + 1).remaining, 1_000n);
    const month = { ...base, period: Period.Month };
    assert.equal(spendingLimitState(month, lastReset).nextReset, lastReset + 30 * DAY);
    assert.equal(spendingLimitState(month, lastReset + 30 * DAY).remaining, 300n);
    assert.equal(spendingLimitState(month, lastReset + 30 * DAY + 1).remaining, 1_000n);
  });

  test('OneTime never resets and has no next reset', () => {
    const once = { ...base, period: Period.OneTime };
    assert.deepEqual(spendingLimitState(once, lastReset + 365 * DAY), {
      remaining: 300n,
      nextReset: null,
    });
  });

  test('accepts the BN-like values and fractional now the app passes', () => {
    const bnLike = {
      amount: { toString: () => '1000' },
      remainingAmount: '0',
      lastReset: String(lastReset),
      period: Period.Day,
    };
    assert.equal(spendingLimitState(bnLike, lastReset + 0.9).remaining, 0n);
    assert.equal(spendingLimitState(bnLike, lastReset + DAY + 1.2).remaining, 1_000n);
  });
});

describe('removedMembers', () => {
  test('returns the limit members that left the multisig', () => {
    const [a, b, c] = [key(1), key(2), key(3)];
    assert.deepEqual(removedMembers([a, b, c], [a, c]), [b]);
  });

  test('returns nothing when all limit members are still members', () => {
    const [a, b] = [key(1), key(2)];
    assert.deepEqual(removedMembers([a], [a, b]), []);
  });

  test('compares by value, not by object identity', () => {
    assert.deepEqual(removedMembers([key(7)], [key(7)]), []);
  });
});

describe('normalizeKeys', () => {
  test('removes duplicates', () => {
    const a = key(5);
    assert.deepEqual(normalizeKeys([a, key(5), a]), [a]);
  });

  test('sorts by bytes like Rust Pubkey, not by base58 string', () => {
    const low = new PublicKey(Uint8Array.from({ length: 32 }, (_, i) => (i === 0 ? 1 : 0)));
    const high = new PublicKey(Uint8Array.from({ length: 32 }, (_, i) => (i === 0 ? 255 : 0)));
    const keys = [high, low, key(9)];
    const byteOrder = [low, key(9), high].map((k) => k.toBase58());
    // A base58 string sort puts `high` before key(9).
    assert.notDeepEqual(keys.map((k) => k.toBase58()).sort(), byteOrder);
    assert.deepEqual(
      normalizeKeys(keys).map((k) => k.toBase58()),
      byteOrder
    );
  });
});

describe('validateSpend', () => {
  const dest = key(4);

  test('allows an amount up to the remaining amount', () => {
    assert.equal(
      validateSpend({ amount: 5n, remaining: 5n, destination: dest, destinations: [] }),
      null
    );
  });

  test('rejects an amount above the remaining amount', () => {
    assert.ok(validateSpend({ amount: 6n, remaining: 5n, destination: dest, destinations: [] }));
  });

  test('an empty destinations list allows any address', () => {
    assert.equal(
      validateSpend({
        amount: 1n,
        remaining: 5n,
        destination: Keypair.generate().publicKey,
        destinations: [],
      }),
      null
    );
  });

  test('a destinations list allows only the listed addresses', () => {
    assert.equal(
      validateSpend({ amount: 1n, remaining: 5n, destination: dest, destinations: [key(4)] }),
      null
    );
    assert.ok(
      validateSpend({ amount: 1n, remaining: 5n, destination: key(8), destinations: [dest] })
    );
  });
});

describe('isNativeMint', () => {
  test('the default pubkey is the native token', () => {
    assert.equal(isNativeMint(NATIVE_MINT_KEY), true);
    assert.equal(isNativeMint(new PublicKey('11111111111111111111111111111111')), true);
    assert.equal(isNativeMint(new PublicKey('So11111111111111111111111111111111111111112')), false);
  });
});

describe('spendingLimitAccountsForActions', () => {
  const multisigPda = Keypair.generate().publicKey;
  const programId = new PublicKey('DDL3Xp6ie85DXgiPkXJ7abUyS2tGv4CGEod2DeQXQ941');

  test('AddSpendingLimit maps to the PDA seeded by its create key', () => {
    const createKey = Keypair.generate().publicKey;
    const [expected] = multisig.getSpendingLimitPda({ multisigPda, createKey, programId });
    const accounts = spendingLimitAccountsForActions(
      [{ __kind: 'AddSpendingLimit', createKey }],
      multisigPda,
      programId
    );
    assert.deepEqual(
      accounts.map((a) => a.toBase58()),
      [expected.toBase58()]
    );
  });

  test('RemoveSpendingLimit maps to the limit it removes', () => {
    const spendingLimit = Keypair.generate().publicKey;
    const accounts = spendingLimitAccountsForActions(
      [{ __kind: 'RemoveSpendingLimit', spendingLimit }],
      multisigPda,
      programId
    );
    assert.deepEqual(accounts, [spendingLimit]);
  });

  test('other actions need no extra accounts', () => {
    assert.deepEqual(
      spendingLimitAccountsForActions(
        [
          { __kind: 'ChangeThreshold', newThreshold: 2 },
          { __kind: 'SetTimeLock', newTimeLock: 60 },
        ],
        multisigPda,
        programId
      ),
      []
    );
  });
});

describe('parseAddressList', () => {
  const a = key(1).toBase58();
  const b = key(2).toBase58();

  test('accepts new lines, commas and spaces, and keeps the input order', () => {
    const parsed = parseAddressList(`${b}\n${a}, ${b}  `);
    assert.ok('keys' in parsed);
    assert.deepEqual(
      parsed.keys.map((k) => k.toBase58()),
      [b, a]
    );
  });

  test('empty input is an empty list', () => {
    assert.deepEqual(parseAddressList('  \n '), { keys: [] });
  });

  test('names the first invalid address', () => {
    assert.deepEqual(parseAddressList(`${a}\nnot-an-address`), {
      error: 'Invalid address: not-an-address',
    });
  });
});
