import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  detectNetwork,
  getNativeSymbol,
  isAccountNotFoundError,
  matchNetwork,
  networkFromGenesisHash,
  NETWORKS,
  type GenesisHashCache,
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

describe('matchNetwork', () => {
  test('identifies X1 by its own hosts', () => {
    for (const value of [
      'https://rpc.mainnet.x1.xyz',
      'https://multisig.mainnet.x1.xyz',
      'multisig.x1.xyz',
    ]) {
      assert.equal(matchNetwork(value)?.id, 'x1-mainnet', value);
    }
    assert.equal(matchNetwork('https://rpc.testnet.x1.xyz')?.id, 'x1-testnet');
  });

  test('does not claim a Solana provider that happens to say "mainnet"', () => {
    // The bug this guards: X1 Mainnet used to carry a bare 'mainnet' marker,
    // so any endpoint with the word in it resolved to X1 and every amount on
    // the Solana deployment was labelled XNT. Helius is the one that bit.
    for (const url of [
      'https://mainnet.helius-rpc.com/?api-key=redacted',
      'https://api.mainnet-beta.solana.com',
      'https://example.solana-mainnet.quiknode.pro/redacted/',
      'https://solana-mainnet.g.alchemy.com/v2/redacted',
      'https://mainnet.rpcpool.com',
    ]) {
      assert.notEqual(matchNetwork(url)?.id, 'x1-mainnet', url);
    }
  });

  test('reads the Solana providers it can', () => {
    for (const url of [
      'https://api.mainnet-beta.solana.com',
      'https://example.solana-mainnet.quiknode.pro/redacted/',
      'https://solana-mainnet.g.alchemy.com/v2/redacted',
    ]) {
      assert.equal(matchNetwork(url)?.id, 'solana-mainnet', url);
    }
  });

  test('an unlabelled endpoint matches nothing, rather than guessing', () => {
    // Callers decide what to do with null: `getNativeSymbol` falls back to the
    // hostname it is served from, which is the one thing that is not a guess.
    for (const url of ['http://localhost:8899', 'https://10.0.0.4:8899', 'https://rpc.example']) {
      assert.equal(matchNetwork(url), null, url);
    }
  });
});

describe('getNativeSymbol', () => {
  /** `getNativeSymbol` reads `window.location.hostname`; node has neither. */
  const onHost = (hostname: string, check: () => void) => {
    const previous = (globalThis as { window?: unknown }).window;
    (globalThis as { window?: unknown }).window = { location: { hostname } };
    try {
      check();
    } finally {
      if (previous === undefined) delete (globalThis as { window?: unknown }).window;
      else (globalThis as { window?: unknown }).window = previous;
    }
  };

  test('the Solana deployment says SOL, whichever provider it is pointed at', () => {
    // The reported bug: a Settings override to Helius on the Solana deployment
    // labelled every amount XNT, because the RPC URL falsely matched X1.
    onHost('multisig.solana-mainnet.x1.xyz', () => {
      for (const rpcUrl of [
        'https://mainnet.helius-rpc.com/?api-key=redacted',
        'https://example.solana-mainnet.quiknode.pro/redacted/',
        'https://api.mainnet-beta.solana.com',
        'http://localhost:8899',
      ]) {
        assert.equal(getNativeSymbol(rpcUrl), 'SOL', rpcUrl);
      }
    });
  });

  test('the X1 deployment says XNT', () => {
    onHost('multisig.mainnet.x1.xyz', () => {
      assert.equal(getNativeSymbol('https://rpc.mainnet.x1.xyz'), 'XNT');
      assert.equal(getNativeSymbol('http://localhost:8899'), 'XNT');
    });
  });

  test('the RPC still wins over the host it is served from', () => {
    // An operator pointing the X1 deployment at Solana is displaying Solana
    // lamports, and the label has to follow the lamports.
    onHost('multisig.mainnet.x1.xyz', () => {
      assert.equal(getNativeSymbol('https://api.mainnet-beta.solana.com'), 'SOL');
    });
  });
});

describe('genesis hash beats URL matching', () => {
  test('identifies a provider whose URL says nothing about the chain', () => {
    // Markers can only work on URLs that name their cluster. A private relay
    // or a bare IP names nothing, and the hash is the only real answer.
    assert.equal(matchNetwork('https://rpc.example/redacted'), null);

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
      assert.equal(
        isAccountNotFoundError(new Error(`Unable to find ${kind} account at abc`)),
        true
      );
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

describe('detectNetwork', () => {
  const X1_MAINNET = '4SvBP3omtvcCVWdxq1zBY5cDp4wndjsThb6nEMn6iMdN';
  const SOLANA_MAINNET = '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d';

  /** An in-memory stand-in for the hook's localStorage cache. */
  const memoryCache = (
    seed: Record<string, string> = {}
  ): GenesisHashCache & {
    entries: Record<string, string>;
  } => {
    const entries = { ...seed };
    return {
      entries,
      read: (rpcUrl) => entries[rpcUrl] ?? null,
      write: (rpcUrl, hash) => {
        entries[rpcUrl] = hash;
      },
    };
  };

  const answers = (hash: string) => ({ getGenesisHash: async () => hash });
  const unreachable = {
    getGenesisHash: async (): Promise<string> => {
      throw new Error('failed to fetch');
    },
  };

  test('asks the endpoint and remembers what it said', async () => {
    const cache = memoryCache();
    const network = await detectNetwork(answers(X1_MAINNET), 'http://localhost:8899', cache);
    assert.equal(network.id, 'x1-mainnet');
    assert.equal(cache.entries['http://localhost:8899'], X1_MAINNET);
  });

  test('a repointed endpoint is re-identified, not read from the cache', async () => {
    // The whole point of the revalidation: this URL served X1 last time and
    // serves Solana now. Trusting the cache here pinned the wrong program IDs
    // for good, with nothing in the UI to clear it.
    const cache = memoryCache({ 'http://localhost:8899': X1_MAINNET });
    const network = await detectNetwork(answers(SOLANA_MAINNET), 'http://localhost:8899', cache);
    assert.equal(network.id, 'solana-mainnet');
    assert.equal(cache.entries['http://localhost:8899'], SOLANA_MAINNET);
  });

  test('falls back to the last hash seen when the endpoint cannot be reached', async () => {
    const cache = memoryCache({ 'https://rpc.example': SOLANA_MAINNET });
    const network = await detectNetwork(unreachable, 'https://rpc.example', cache);
    assert.equal(network.id, 'solana-mainnet');
  });

  test('an unreachable endpoint never seen before stays unresolved', async () => {
    // Callers read a rejected query as "not resolved yet" and hold. Guessing
    // from the URL here would hand them an identity nothing confirmed.
    await assert.rejects(
      detectNetwork(unreachable, 'https://rpc.example', memoryCache()),
      /failed to fetch/
    );
  });

  test('an unrecognised hash falls back to matching the URL', async () => {
    // A local validator generates its own genesis; the URL is all there is.
    const cache = memoryCache();
    const network = await detectNetwork(
      answers('11111111111111111111111111111111'),
      'https://rpc.testnet.x1.xyz',
      cache
    );
    assert.equal(network.id, 'x1-testnet');
  });
});
