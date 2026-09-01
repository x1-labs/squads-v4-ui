import { afterEach, beforeEach, describe, mock, test } from 'node:test';
import assert from 'node:assert/strict';
import type { Connection, SignatureStatus, Transaction } from '@solana/web3.js';
import {
  sendAndConfirm,
  TransactionExpiredError,
  TransactionFailedError,
  TransactionStatusUnknownError,
} from './sendAndConfirm.ts';

const confirmed = { err: null, confirmationStatus: 'confirmed' } as SignatureStatus;
const finalized = { err: null, confirmationStatus: 'finalized' } as SignatureStatus;
const processed = { err: null, confirmationStatus: 'processed' } as SignatureStatus;

const signedTx = { serialize: () => Buffer.from('deadbeef', 'hex') } as unknown as Transaction;

type Step<T> = T | (() => T);
const next = <T>(steps: Step<T>[], i: number): T => {
  const step = steps[Math.min(i, steps.length - 1)];
  return typeof step === 'function' ? (step as () => T)() : step;
};

/**
 * A Connection stub. `statuses` and `heights` are consumed one per call and the
 * last entry repeats; a function entry is invoked, so it can throw.
 */
function fakeConnection({
  statuses = [] as Step<SignatureStatus | null>[],
  heights = [] as Step<number>[],
} = {}) {
  const calls = {
    sends: [] as { skipPreflight?: boolean; maxRetries?: number }[],
    statusPolls: 0,
    heightPolls: 0,
  };
  const connection = {
    sendRawTransaction: async (_raw: Uint8Array, opts: (typeof calls.sends)[number]) => {
      calls.sends.push(opts);
      return 'SIGabc';
    },
    getSignatureStatuses: async () => ({ value: [next(statuses, calls.statusPolls++) ?? null] }),
    getBlockHeight: async () => next(heights, calls.heightPolls++) ?? 0,
  };
  return { calls, connection: connection as unknown as Connection };
}

/** Drive a promise to settlement under mocked timers, one second per tick. */
async function run<T>(promise: Promise<T>): Promise<T> {
  let settled = false;
  promise.then(
    () => (settled = true),
    () => (settled = true)
  );
  while (!settled) {
    // Let every pending microtask (RPC stub responses) drain before advancing.
    for (let i = 0; i < 10; i++) await new Promise((resolve) => setImmediate(resolve));
    mock.timers.tick(1_000);
  }
  return promise;
}

const rejects = async (promise: Promise<unknown>): Promise<Error> => {
  try {
    await run(promise);
  } catch (error) {
    return error as Error;
  }
  throw new Error('expected rejection');
};

describe('sendAndConfirm', () => {
  beforeEach(() => mock.timers.enable({ apis: ['setTimeout', 'Date'] }));
  afterEach(() => mock.timers.reset());

  test('resolves at confirmed, without waiting for finalized', async () => {
    const { calls, connection } = fakeConnection({ statuses: [null, confirmed], heights: [100] });
    const sig = await run(sendAndConfirm(connection, signedTx, 999));
    assert.equal(sig, 'SIGabc');
    assert.equal(calls.sends[0].skipPreflight, false, 'first send keeps preflight');
    assert.equal(calls.sends[0].maxRetries, 0, 'first send disables RPC retries');
  });

  test('finalized also counts as landed', async () => {
    const { calls, connection } = fakeConnection({ statuses: [finalized], heights: [100] });
    assert.equal(await run(sendAndConfirm(connection, signedTx, 999)), 'SIGabc');
    assert.equal(calls.statusPolls, 1);
  });

  test('rebroadcasts while the cluster has not seen the transaction', async () => {
    const { calls, connection } = fakeConnection({
      statuses: [null, null, null, null, confirmed],
      heights: [100],
    });
    await run(sendAndConfirm(connection, signedTx, 999));
    assert.ok(calls.sends.length > 1, `expected resends, got ${calls.sends.length} sends`);
    assert.ok(
      calls.sends.slice(1).every((o) => o.skipPreflight === true),
      'resends skip preflight'
    );
  });

  test('does not rebroadcast once the transaction is processed', async () => {
    const { calls, connection } = fakeConnection({
      statuses: [processed, processed, processed, processed, confirmed],
      heights: [100],
    });
    await run(sendAndConfirm(connection, signedTx, 999));
    assert.equal(calls.sends.length, 1, 'a processed transaction is already with the leader');
  });

  test('expires by block height, and says nothing landed when it was never seen', async () => {
    const { connection } = fakeConnection({ statuses: [null], heights: [1000] });
    const error = await rejects(sendAndConfirm(connection, signedTx, 999));
    assert.ok(error instanceof TransactionExpiredError);
    assert.match(error.message, /never included in a block/);
    assert.equal((error as TransactionExpiredError).lastStatus, null);
  });

  test('a processed-but-unconfirmed expiry tells the user to check before retrying', async () => {
    const { connection } = fakeConnection({ statuses: [processed], heights: [1000] });
    const error = await rejects(sendAndConfirm(connection, signedTx, 999));
    assert.ok(error instanceof TransactionExpiredError);
    assert.match(error.message, /Check the explorer/);
    assert.doesNotMatch(error.message, /Safe to retry/);
  });

  test('keeps trying while the blockhash is still alive', async () => {
    const statuses: Step<SignatureStatus | null>[] = Array(12).fill(null);
    statuses.push(confirmed);
    const { connection } = fakeConnection({ statuses, heights: [900, 950, 998] });
    assert.equal(await run(sendAndConfirm(connection, signedTx, 999)), 'SIGabc');
  });

  test('an on-chain error is fatal and is not rebroadcast', async () => {
    const { calls, connection } = fakeConnection({
      statuses: [
        { err: { InstructionError: [0, { Custom: 6000 }] } } as unknown as SignatureStatus,
      ],
      heights: [100],
    });
    const error = await rejects(sendAndConfirm(connection, signedTx, 999));
    assert.ok(error instanceof TransactionFailedError);
    assert.equal(calls.sends.length, 1);
  });

  test('a transaction that lands during the expiry grace polls is not reported expired', async () => {
    // Height says expired on the first check; status catches up two polls later.
    const { connection } = fakeConnection({
      statuses: [null, null, null, null, null, null, null, confirmed],
      heights: [5000],
    });
    assert.equal(await run(sendAndConfirm(connection, signedTx, 999)), 'SIGabc');
  });

  test('a transient RPC error while polling is retried, not reported as failure', async () => {
    const rateLimited = () => {
      throw new Error('429 Too Many Requests');
    };
    const { calls, connection } = fakeConnection({
      statuses: [null, rateLimited, rateLimited, confirmed],
      heights: [rateLimited, 100],
    });
    assert.equal(await run(sendAndConfirm(connection, signedTx, 999)), 'SIGabc');
    assert.equal(calls.statusPolls, 4);
  });

  test('gives up with an unknown-outcome error if the RPC never answers', async () => {
    const dead = () => {
      throw new Error('fetch failed');
    };
    const { connection } = fakeConnection({ statuses: [dead], heights: [dead] });
    const error = await rejects(sendAndConfirm(connection, signedTx, 999));
    assert.ok(error instanceof TransactionStatusUnknownError);
    assert.match(error.message, /Check the explorer/);
  });
});
