import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  isAccountNotFoundError,
  matchNetwork,
  networkFromGenesisHash,
  NETWORKS,
} from './network.ts';

describe('networkFromGenesisHash', () => {
  test('identifies each configured network', () => {
    assert.equal(
      networkFromGenesisHash('4SvBP3omtvcCVWdxq1zBY5cDp4wndjsThb6nEMn6iMdN')?.id,
      'x1-mainnet'
    );
    assert.equal(
      networkFromGenesisHash('C7ucgdDEhxLTpXHhWSZxavSVmaNTUJWwT5iTdeaviDho')?.id,
      'x1-testnet'
    );
    assert.equal(
      networkFromGenesisHash('5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d')?.id,
      'solana-mainnet'
    );
  });

  test('every network round-trips through its own hash', () => {
    for (const network of NETWORKS) {
      assert.equal(networkFromGenesisHash(network.genesisHash)?.id, network.id);
    }
  });

  test('genesis hashes are unique across networks', () => {
    // A duplicate would make one network permanently unreachable.
    const hashes = NETWORKS.map((n) => n.genesisHash);
    assert.equal(new Set(hashes).size, hashes.length);
  });

  test('returns null for an unrecognised hash', () => {
    // A local validator generates a fresh genesis hash on each start.
    assert.equal(networkFromGenesisHash('11111111111111111111111111111111'), null);
  });

  test('returns null for absent values', () => {
    assert.equal(networkFromGenesisHash(null), null);
    assert.equal(networkFromGenesisHash(undefined), null);
    assert.equal(networkFromGenesisHash(''), null);
  });
});

describe('genesis hash beats URL matching', () => {
  test('a Helius endpoint that matchNetwork gets wrong', () => {
    // Regression guard. `mainnet.helius-rpc.com` serves Solana, but contains
    // the substring 'mainnet', which is an X1 Mainnet marker. URL matching
    // therefore reports X1 and labels balances XNT. The genesis hash does not
    // have this failure mode.
    const url = 'https://mainnet.helius-rpc.com/?api-key=redacted';
    assert.equal(matchNetwork(url)?.id, 'x1-mainnet');

    const byHash = networkFromGenesisHash('5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d');
    assert.equal(byHash?.id, 'solana-mainnet');
    assert.equal(byHash?.nativeSymbol, 'SOL');
  });
});

describe('isAccountNotFoundError', () => {
  test('matches the Multisig account miss', () => {
    // Thrown by @sqds/multisig when getAccountInfo returns null.
    const error = new Error(
      'Unable to find Multisig account at 89PksQjFwnpUNu3Rc3GLdnZnBCbUNLNruDHcjdU1zPfs'
    );
    assert.equal(isAccountNotFoundError(error), true);
  });

  test('matches the other generated account types', () => {
    for (const kind of ['Batch', 'ConfigTransaction', 'ProgramConfig', 'Proposal']) {
      assert.equal(isAccountNotFoundError(new Error(`Unable to find ${kind} account at abc`)), true);
    }
  });

  test('does not match transport or RPC failures', () => {
    // These must keep surfacing as errors. Swallowing them hides a broken RPC.
    assert.equal(isAccountNotFoundError(new Error('failed to fetch')), false);
    assert.equal(isAccountNotFoundError(new Error('403 Forbidden')), false);
    assert.equal(isAccountNotFoundError(new Error('Invalid public key input')), false);
    assert.equal(isAccountNotFoundError(new Error('429 Too Many Requests')), false);
  });

  test('tolerates non-Error values', () => {
    assert.equal(isAccountNotFoundError(null), false);
    assert.equal(isAccountNotFoundError(undefined), false);
    assert.equal(isAccountNotFoundError('Unable to find Multisig account at abc'), true);
    assert.equal(isAccountNotFoundError({ code: 500 }), false);
  });
});
