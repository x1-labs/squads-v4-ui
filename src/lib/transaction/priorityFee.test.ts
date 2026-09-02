import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import type { Connection } from '@solana/web3.js';
import {
  getPriorityFeeMicroLamports,
  runtimeDefaultComputeUnits,
  sizeComputeUnitLimit,
} from './priorityFee.ts';

const feeMarket = (fees: number[]) =>
  ({
    getRecentPrioritizationFees: async () =>
      fees.map((prioritizationFee) => ({ prioritizationFee })),
  }) as unknown as Connection;

describe('getPriorityFeeMicroLamports', () => {
  test('an all-zero market (what mainnet usually reports) floors at 1000, never 0', async () => {
    assert.equal(await getPriorityFeeMicroLamports(feeMarket(Array(150).fill(0)), []), 1_000);
  });

  test('runaway fees clamp to the ceiling', async () => {
    assert.equal(
      await getPriorityFeeMicroLamports(feeMarket(Array(20).fill(50_000_000)), []),
      100_000
    );
  });

  test('bids the 75th percentile of a spread', async () => {
    const fees = [0, 0, 0, 0, 5_000, 5_000, 20_000, 90_000];
    assert.equal(await getPriorityFeeMicroLamports(feeMarket(fees), []), 20_000);
  });

  test('a failing lookup degrades to the floor rather than blocking the action', async () => {
    const broken = {
      getRecentPrioritizationFees: async () => {
        throw new Error('429 rate limited');
      },
    } as unknown as Connection;
    assert.equal(await getPriorityFeeMicroLamports(broken, []), 1_000);
  });
});

describe('sizeComputeUnitLimit', () => {
  test('adds margin and the budget instructions own cost to the measured usage', () => {
    assert.equal(sizeComputeUnitLimit(10_000), 12_600);
  });

  test('never goes below the caller floor', () => {
    assert.equal(sizeComputeUnitLimit(10_000, 400_000), 400_000);
    assert.equal(sizeComputeUnitLimit(500_000, 400_000), 600_600);
  });
});

describe('runtimeDefaultComputeUnits', () => {
  test('matches what the runtime grants an unbudgeted transaction', () => {
    assert.equal(runtimeDefaultComputeUnits(1), 200_000);
    assert.equal(runtimeDefaultComputeUnits(5), 1_000_000);
    assert.equal(runtimeDefaultComputeUnits(10), 1_400_000);
  });
});
