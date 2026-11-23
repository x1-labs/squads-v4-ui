import { afterEach, beforeEach, describe, mock, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  Keypair,
  NONCE_ACCOUNT_LENGTH,
  SendTransactionError,
  SystemProgram,
} from '@solana/web3.js';
import type { Connection, SignatureStatus, Transaction } from '@solana/web3.js';
import bs58 from 'bs58';
import {
  sendAndConfirm,
  TransactionExpiredError,
  TransactionFailedError,
  TransactionStatusUnknownError,
} from './sendAndConfirm.ts';

const confirmed = { err: null, confirmationStatus: 'confirmed' } as SignatureStatus;
const finalized = { err: null, confirmationStatus: 'finalized' } as SignatureStatus;
const processed = { err: null, confirmationStatus: 'processed' } as SignatureStatus;

/** A blockhash lifetime that ends once block height passes 999. */
const BH = { kind: 'blockhash', lastValidBlockHeight: 999 } as const;

const nonceAccount = Keypair.generate().publicKey;
const NONCE_A = bs58.encode(Buffer.alloc(32, 1));
const NONCE_B = bs58.encode(Buffer.alloc(32, 2));
/** A durable-nonce lifetime signed with NONCE_A. */
const NONCE = { kind: 'nonce', nonceAccount, nonce: NONCE_A, minContextSlot: 4242 } as const;

/** System-program nonce account data (versioned, initialized) holding `nonce`. */
function nonceAccountInfo(nonce: string) {
  const data = Buffer.alloc(NONCE_ACCOUNT_LENGTH);
  data.writeUInt32LE(1, 0); // version: current
  data.writeUInt32LE(1, 4); // state: initialized
  Keypair.generate().publicKey.toBuffer().copy(data, 8); // authority
  Buffer.from(bs58.decode(nonce)).copy(data, 40);
  return { data, owner: SystemProgram.programId, lamports: 1_447_680, executable: false };
}

const signatureBytes = Buffer.alloc(64, 7);
const SIG = bs58.encode(signatureBytes);
const signedTx = {
  serialize: () => Buffer.from('deadbeef', 'hex'),
  signature: signatureBytes,
} as unknown as Transaction;

type Step<T> = T | (() => T);
const next = <T>(steps: Step<T>[], i: number): T => {
  const step = steps[Math.min(i, steps.length - 1)];
  return typeof step === 'function' ? (step as () => T)() : step;
};

type SendOptions = { skipPreflight?: boolean; preflightCommitment?: string; maxRetries?: number };

/**
 * A Connection stub. `sends`, `statuses` and `heights` are consumed one per call
 * and the last entry repeats; a function entry is invoked, so it can throw.
 */
function fakeConnection({
  sends = [SIG] as Step<string>[],
  statuses = [] as Step<SignatureStatus | null>[],
  heights = [] as Step<number>[],
  /** Values the nonce account holds, one per read; null is a closed account. */
  nonces = [NONCE_A] as Step<string | null>[],
} = {}) {
  const calls = {
    sends: [] as SendOptions[],
    statusPolls: 0,
    heightPolls: 0,
    nonceReads: 0,
    nonceReadConfigs: [] as unknown[],
  };
  const connection = {
    rpcEndpoint: 'http://rpc.test',
    sendRawTransaction: async (_raw: Uint8Array, opts: SendOptions) => {
      calls.sends.push(opts);
      return next(sends, calls.sends.length - 1);
    },
    getSignatureStatuses: async () => ({ value: [next(statuses, calls.statusPolls++) ?? null] }),
    getBlockHeight: async () => next(heights, calls.heightPolls++) ?? 0,
    getAccountInfo: async (_address: unknown, config: unknown) => {
      calls.nonceReadConfigs.push(config);
      const nonce = next(nonces, calls.nonceReads++);
      return nonce === null ? null : nonceAccountInfo(nonce);
    },
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
    const sig = await run(sendAndConfirm(connection, signedTx, BH));
    assert.equal(sig, SIG);
    assert.equal(calls.sends[0].skipPreflight, false, 'first send keeps preflight');
    assert.equal(calls.sends[0].preflightCommitment, 'processed');
    assert.equal(calls.sends[0].maxRetries, 0, 'first send disables RPC retries');
  });

  test('the signature comes from the signed bytes, not from what the RPC echoes back', async () => {
    const { connection } = fakeConnection({ sends: ['whatever'], statuses: [confirmed] });
    assert.equal(await run(sendAndConfirm(connection, signedTx, BH)), SIG);
  });

  test('a send the RPC rejected outright is fatal, and nothing is polled', async () => {
    const rejected = () => {
      throw new SendTransactionError({
        action: 'simulate',
        signature: '',
        transactionMessage: 'Blockhash not found',
      });
    };
    const { calls, connection } = fakeConnection({ sends: [rejected], statuses: [confirmed] });
    const error = await rejects(sendAndConfirm(connection, signedTx, BH));
    assert.ok(error instanceof SendTransactionError);
    assert.equal(calls.statusPolls, 0);
    assert.equal(calls.sends.length, 1);
  });

  test('a send whose answer was lost in transit is tracked, not reported as unsent', async () => {
    // The RPC may have forwarded it before the connection dropped. Polling finds
    // it landed; throwing here would have had the user sign a duplicate.
    const dropped = () => {
      throw new Error('502 Bad Gateway');
    };
    const { calls, connection } = fakeConnection({
      sends: [dropped, SIG],
      statuses: [null, confirmed],
      heights: [100],
    });
    assert.equal(await run(sendAndConfirm(connection, signedTx, BH)), SIG);
    assert.ok(calls.statusPolls >= 1);
  });

  test('a lost send that the cluster never saw is pushed again by the rebroadcast', async () => {
    const dropped = () => {
      throw new Error('fetch failed');
    };
    const { calls, connection } = fakeConnection({
      sends: [dropped, SIG],
      statuses: [null, null, null, confirmed],
      heights: [100],
    });
    assert.equal(await run(sendAndConfirm(connection, signedTx, BH)), SIG);
    assert.ok(calls.sends.length >= 2, 'the transport failure was followed by a resend');
    assert.equal(calls.sends[1].skipPreflight, true);
  });

  test('finalized also counts as landed', async () => {
    const { calls, connection } = fakeConnection({ statuses: [finalized], heights: [100] });
    assert.equal(await run(sendAndConfirm(connection, signedTx, BH)), SIG);
    assert.equal(calls.statusPolls, 1);
  });

  test('rebroadcasts while the cluster has not seen the transaction', async () => {
    const { calls, connection } = fakeConnection({
      statuses: [null, null, null, null, confirmed],
      heights: [100],
    });
    await run(sendAndConfirm(connection, signedTx, BH));
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
    await run(sendAndConfirm(connection, signedTx, BH));
    assert.equal(calls.sends.length, 1, 'a processed transaction is already with the leader');
  });

  test('expires by block height, and says nothing landed when it was never seen', async () => {
    const { connection } = fakeConnection({ statuses: [null], heights: [1000] });
    const error = await rejects(sendAndConfirm(connection, signedTx, BH));
    assert.ok(error instanceof TransactionExpiredError);
    assert.match(error.message, /never included in a block/);
    assert.equal((error as TransactionExpiredError).lastStatus, null);
  });

  test('a processed-but-unconfirmed expiry tells the user to check before retrying', async () => {
    const { connection } = fakeConnection({ statuses: [processed], heights: [1000] });
    const error = await rejects(sendAndConfirm(connection, signedTx, BH));
    assert.ok(error instanceof TransactionExpiredError);
    assert.match(error.message, /Check the explorer/);
    assert.doesNotMatch(error.message, /Safe to retry/);
  });

  test('keeps trying while the blockhash is still alive', async () => {
    const statuses: Step<SignatureStatus | null>[] = Array(12).fill(null);
    statuses.push(confirmed);
    const { connection } = fakeConnection({ statuses, heights: [900, 950, 998] });
    assert.equal(await run(sendAndConfirm(connection, signedTx, BH)), SIG);
  });

  test('an on-chain error is fatal and is not rebroadcast', async () => {
    const { calls, connection } = fakeConnection({
      statuses: [
        { err: { InstructionError: [0, { Custom: 6000 }] } } as unknown as SignatureStatus,
      ],
      heights: [100],
    });
    const error = await rejects(sendAndConfirm(connection, signedTx, BH));
    assert.ok(error instanceof TransactionFailedError);
    assert.equal(calls.sends.length, 1);
  });

  test('a transaction that lands during the expiry grace polls is not reported expired', async () => {
    // Height says expired on the first check; status catches up two polls later.
    const { connection } = fakeConnection({
      statuses: [null, null, null, null, null, null, null, confirmed],
      heights: [5000],
    });
    assert.equal(await run(sendAndConfirm(connection, signedTx, BH)), SIG);
  });

  test('a failed status query during the grace polls does not cut them short', async () => {
    // The grace polls are the last chance to notice a transaction that landed
    // in the final block of its window; a 429 in the middle must not spend one.
    const rateLimited = () => {
      throw new Error('429 Too Many Requests');
    };
    const statuses: Step<SignatureStatus | null>[] = [null, null, null, null, null];
    statuses.push(rateLimited, null, confirmed);
    const { connection } = fakeConnection({ statuses, heights: [5000] });
    assert.equal(await run(sendAndConfirm(connection, signedTx, BH)), SIG);
  });

  test('a transient RPC error while polling is retried, not reported as failure', async () => {
    const rateLimited = () => {
      throw new Error('429 Too Many Requests');
    };
    const { calls, connection } = fakeConnection({
      statuses: [null, rateLimited, rateLimited, confirmed],
      heights: [rateLimited, 100],
    });
    assert.equal(await run(sendAndConfirm(connection, signedTx, BH)), SIG);
    assert.equal(calls.statusPolls, 4);
  });

  test('gives up with an unknown-outcome error if the RPC never answers', async () => {
    const dead = () => {
      throw new Error('fetch failed');
    };
    const { connection } = fakeConnection({ statuses: [dead], heights: [dead] });
    const error = await rejects(sendAndConfirm(connection, signedTx, BH));
    assert.ok(error instanceof TransactionStatusUnknownError);
    assert.match(error.message, /Check the explorer/);
  });

  test('the silence backstop counts from the last answer, so a slow landing is not cut off', async () => {
    // The RPC answers every poll; the transaction just takes a while. Height
    // says the blockhash is still alive throughout.
    const statuses: Step<SignatureStatus | null>[] = Array(150).fill(null);
    statuses.push(confirmed);
    const { connection } = fakeConnection({ statuses, heights: [900] });
    assert.equal(await run(sendAndConfirm(connection, signedTx, BH)), SIG);
  });

  test('an RPC that answers status but never height is still capped', async () => {
    const dead = () => {
      throw new Error('fetch failed');
    };
    const { connection } = fakeConnection({ statuses: [null], heights: [dead] });
    const error = await rejects(sendAndConfirm(connection, signedTx, BH));
    assert.ok(error instanceof TransactionStatusUnknownError);
  });

  describe('with a durable nonce', () => {
    test('stays alive long past a blockhash window while the nonce is unused', async () => {
      // 60 polls is ~60s: well past the ~33s a Solana blockhash lasts.
      const statuses: Step<SignatureStatus | null>[] = Array(60).fill(null);
      statuses.push(confirmed);
      const { calls, connection } = fakeConnection({ statuses, nonces: [NONCE_A] });
      assert.equal(await run(sendAndConfirm(connection, signedTx, NONCE)), SIG);
      assert.equal(calls.heightPolls, 0, 'block height is irrelevant to a nonce transaction');
      assert.ok(calls.nonceReads > 0);
      assert.deepEqual(
        calls.nonceReadConfigs[0],
        { commitment: 'confirmed', minContextSlot: 4242 },
        'a lagging node may not answer with an older nonce'
      );
      assert.ok(calls.sends.length > 1, 'still rebroadcast while unseen');
    });

    test('an advanced nonce with no landed signature ends it as expired, safe to retry', async () => {
      const { connection } = fakeConnection({ statuses: [null], nonces: [NONCE_B] });
      const error = await rejects(sendAndConfirm(connection, signedTx, NONCE));
      assert.ok(error instanceof TransactionExpiredError);
      assert.equal((error as TransactionExpiredError).lifetime, 'nonce');
      assert.match(error.message, /durable nonce was used by another transaction/);
      assert.match(error.message, /Safe to retry/);
    });

    test('a closed nonce account also ends it', async () => {
      const { connection } = fakeConnection({ statuses: [null], nonces: [null] });
      const error = await rejects(sendAndConfirm(connection, signedTx, NONCE));
      assert.ok(error instanceof TransactionExpiredError);
    });

    test('the nonce advancing because this transaction landed is caught by the grace polls', async () => {
      // The nonce read is ahead of the status node: it sees the advance this
      // very transaction caused before the status query reports it.
      const { connection } = fakeConnection({
        statuses: [null, null, null, null, null, null, confirmed],
        nonces: [NONCE_B],
      });
      assert.equal(await run(sendAndConfirm(connection, signedTx, NONCE)), SIG);
    });

    test('a failed nonce read is retried, not treated as expiry', async () => {
      const dead = () => {
        throw new Error('429 Too Many Requests');
      };
      const statuses: Step<SignatureStatus | null>[] = Array(12).fill(null);
      statuses.push(confirmed);
      const { connection } = fakeConnection({ statuses, nonces: [dead, NONCE_A] });
      assert.equal(await run(sendAndConfirm(connection, signedTx, NONCE)), SIG);
    });
  });
});
