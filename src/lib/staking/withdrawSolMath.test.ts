import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  formatTokenAmount,
  maxPoolTokensForLamports,
  maxReserveWithdrawLamports,
  parseTokenAmount,
  quoteWithdrawSol,
  type WithdrawSolPoolState,
} from './withdrawSolMath.ts';

// X1 Delegation Pool at epoch 392, read from mainnet.
const pool: WithdrawSolPoolState = {
  totalLamports: 355_495_106_563_581_311n,
  poolTokenSupply: 357_716_763_775_693_500n,
  solWithdrawalFee: { numerator: 1n, denominator: 1000n },
};

describe('parseTokenAmount', () => {
  test('keeps every raw unit of a balance above 2^53', () => {
    // parseFloat * 1e9 turned this into ...520060, 11 units more than the vault held.
    assert.equal(parseTokenAmount('244169440.391520049', 9), 244_169_440_391_520_049n);
  });

  test('pads short fractions and accepts bare wholes or fractions', () => {
    assert.equal(parseTokenAmount('1.5', 9), 1_500_000_000n);
    assert.equal(parseTokenAmount('7', 9), 7_000_000_000n);
    assert.equal(parseTokenAmount('.25', 9), 250_000_000n);
  });

  test('rejects junk and precision the mint cannot hold', () => {
    for (const bad of ['', '.', 'abc', '-1', '1e9', '1.2.3', '0.0000000001']) {
      assert.equal(parseTokenAmount(bad, 9), null, bad);
    }
  });
});

describe('formatTokenAmount', () => {
  test('round-trips with parseTokenAmount', () => {
    for (const raw of [0n, 1n, 1_000_000_000n, 244_169_440_391_520_049n]) {
      assert.equal(parseTokenAmount(formatTokenAmount(raw, 9), 9), raw);
    }
  });

  test('trims trailing zeros', () => {
    assert.equal(formatTokenAmount(1_500_000_000n, 9), '1.5');
    assert.equal(formatTokenAmount(0n, 9), '0');
  });
});

describe('quoteWithdrawSol', () => {
  test('matches the reserve delta mainnet simulated for 1,000 fee-free tokens', () => {
    // The reserve dropped by 993.789339... XNT burning 1,000 pool tokens from the
    // manager fee account.
    const { lamports, feePoolTokens } = quoteWithdrawSol(pool, 1_000_000_000_000n, true);
    assert.equal(feePoolTokens, 0n);
    assert.equal(lamports, 993_789_339_955n);
  });

  test('charges the fee, rounded up, when burning from any other account', () => {
    const { feePoolTokens } = quoteWithdrawSol(pool, 1_001n, false);
    assert.equal(feePoolTokens, 2n); // 1.001 rounds up
  });

  test('pays nothing for dust or from an empty pool', () => {
    assert.equal(quoteWithdrawSol(pool, 1n, true).lamports, 0n);
    const empty = { ...pool, totalLamports: 0n, poolTokenSupply: 0n };
    assert.equal(quoteWithdrawSol(empty, 1_000n, true).lamports, 0n);
  });
});

describe('maxReserveWithdrawLamports', () => {
  test('holds back the rent-exempt reserve plus one lamport', () => {
    // Mainnet reported a ceiling of 34442229437415181 for this reserve.
    const max = maxReserveWithdrawLamports(34_442_229_439_698_060n, 2_282_880n);
    assert.equal(max, 34_442_229_437_415_179n);
    assert.ok(max <= 34_442_229_437_415_181n);
  });

  test('never goes negative', () => {
    assert.equal(maxReserveWithdrawLamports(2_000_000n, 2_282_880n), 0n);
  });
});

describe('maxPoolTokensForLamports', () => {
  const cases: Array<[string, WithdrawSolPoolState, boolean]> = [
    ['fee waived', pool, true],
    ['0.1% fee', pool, false],
    ['0.2% fee', { ...pool, solWithdrawalFee: { numerator: 2n, denominator: 1000n } }, false],
    ['1:1 pool', { ...pool, totalLamports: pool.poolTokenSupply }, false],
  ];

  for (const [name, state, waived] of cases) {
    test(`${name}: the max fits and one more unit does not`, () => {
      for (const cap of [1n, 993_789_339_955n, 34_442_229_437_415_179n]) {
        const max = maxPoolTokensForLamports(state, cap, waived);
        assert.ok(quoteWithdrawSol(state, max, waived).lamports <= cap, `${cap} fits`);
        assert.ok(quoteWithdrawSol(state, max + 1n, waived).lamports > cap, `${cap} is tight`);
      }
    });
  }

  test('a 100% fee pays nothing, so nothing is withdrawable', () => {
    const all = { ...pool, solWithdrawalFee: { numerator: 1n, denominator: 1n } };
    assert.equal(maxPoolTokensForLamports(all, 1_000_000n, false), 0n);
  });
});
