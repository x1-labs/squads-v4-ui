import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { PublicKey } from '@solana/web3.js';
import type { Connection } from '@solana/web3.js';
import { getMultipleAccountsInfoChunked, isTransactionStale } from './proposals.ts';

describe('isTransactionStale', () => {
  test('the index equal to staleTransactionIndex is stale, as in proposal_vote.rs', () => {
    assert.equal(isTransactionStale(180, 180), true);
  });

  test('older indexes are stale, newer ones are not', () => {
    assert.equal(isTransactionStale(130, 15), true);
    assert.equal(isTransactionStale(130, 131), false);
  });

  test('accepts the bigint the SDK returns', () => {
    assert.equal(isTransactionStale(130n, 130), true);
  });
});

describe('getMultipleAccountsInfoChunked', () => {
  const addresses = Array.from({ length: 250 }, () => PublicKey.unique());

  test('splits into calls of at most 100 and keeps input order', async () => {
    const calls: number[] = [];
    const connection = {
      getMultipleAccountsInfo: async (keys: PublicKey[]) => {
        calls.push(keys.length);
        return keys.map((k) => ({ data: Buffer.from(k.toBytes()) }));
      },
    } as unknown as Connection;

    const infos = await getMultipleAccountsInfoChunked(connection, addresses);

    assert.deepEqual(calls, [100, 100, 50]);
    assert.equal(infos.length, 250);
    infos.forEach((info, i) => assert.ok(info!.data.equals(Buffer.from(addresses[i].toBytes()))));
  });

  test('a failed chunk rejects instead of reading as missing accounts', async () => {
    let n = 0;
    const connection = {
      getMultipleAccountsInfo: async (keys: PublicKey[]) => {
        if (n++ === 1) throw new Error('429 Too Many Requests');
        return keys.map(() => null);
      },
    } as unknown as Connection;

    await assert.rejects(getMultipleAccountsInfoChunked(connection, addresses), /429/);
  });
});
