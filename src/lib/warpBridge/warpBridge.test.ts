import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import anchor from '@coral-xyz/anchor';
import {
  describeRecoveryMode,
  describeSequenceRoute,
  enumVariantName,
  formatBytes32,
  formatCounterparty,
  formatUnixTime,
  toBigInt,
} from './values.ts';

const idlPath = new URL('../idls/warp_bridge.json', import.meta.url);
const idlBytes = readFileSync(idlPath);
const idl = JSON.parse(idlBytes.toString('utf8'));

describe('bundled warp bridge IDL', () => {
  test('is byte-identical to the IDL frozen for the PR-121 mainnet release', () => {
    // target/idl/warp_bridge.json at warp-bridge 05319af, recorded in the
    // release freeze as the deployed program's interface.
    const sha256 = createHash('sha256').update(idlBytes).digest('hex');
    assert.equal(sha256, '39f7fd10180440dc94778233ff306d7e3582f7cccc5e97c12403c6f8f30f2ec3');
  });

  test('every instruction in the IDL is registered with the instruction registry', () => {
    // The registry module pulls in React components, so read its source and
    // check the warp bridge block for one entry per IDL instruction.
    const registrySource = readFileSync(new URL('../../registry.ts', import.meta.url), 'utf8');
    const start = registrySource.indexOf("name: 'Warp Bridge'");
    const end = registrySource.indexOf('registry.register(', start);
    assert.ok(start > 0 && end > start, 'warp bridge registry block not found');
    const block = registrySource.slice(start, end);

    const missing = idl.instructions
      .map((ix: { name: string }) => ix.name)
      .filter((name: string) => !new RegExp(`\\n\\s+${name}: \\{`).test(block));
    assert.deepEqual(missing, []);
  });

  test('decodes X1 Squads transaction #188 (recovery policy, token pause, cancellation)', () => {
    const coder = new anchor.BorshInstructionCoder(idl);
    const decode = (hex: string) => coder.decode(Buffer.from(hex, 'hex'));

    const init = decode('515243d220739cb8');
    assert.equal(init?.name, 'initialize_recovery_policy');

    const pause = decode(
      '67a4d53123dbd44d95e683cd1c5dab0975315b5815b64ec6c6389e81bf426e4e4d1bdaa534bcd2a401'
    );
    assert.equal(pause?.name, 'set_token_pause');
    assert.equal(
      (pause?.data as any).local_mint.toBase58(),
      'B69chRzqzDCmdB5WYB8NRu5Yv5ZA95ABiZcdzCgGm9Tq'
    );
    assert.equal((pause?.data as any).paused, true);

    const mode = decode('c808da6db0b2325301');
    assert.equal(mode?.name, 'set_recovery_mode');
    assert.equal(enumVariantName((mode?.data as any).mode), 'CancellationOnly');

    const cancel = decode(
      '43e37ff937f833b020e295df6900000133da7d7cc126c66a12b816e29e494fafc5be752495f49a0fda771b253f592711c6fa7af3bedbad3a3d65f36aabc97431b1bbe4c2d2f6e0e47ca60203452f5d6140548900000000009d47c86a000000000075ba392c68c880c97d62d4e4fbcd431007dbd42c0234f04ec381561963bc9e93'
    );
    assert.equal(cancel?.name, 'cancel_inbound');
    const args = cancel?.data as any;
    assert.equal(toBigInt(args.source_seq), BigInt('72058048760635936'));
    assert.equal(describeSequenceRoute(args.source_seq), 'Solana → X1');
    assert.equal(formatCounterparty(args.sender), '4VR2XrUfr8KY8LYLqT2taaE4L1hXJDmTZxYUTeCgL9wn');
    assert.equal(args.source_token_mint.toBase58(), 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
    assert.equal(toBigInt(args.amount), BigInt(9_000_000));
    assert.equal(formatUnixTime(args.source_timestamp), '2026-10-09T01:47:09Z');
    assert.equal(args.reason_code, 0);
    assert.equal(
      formatBytes32(args.incident_id),
      '75ba392c68c880c97d62d4e4fbcd431007dbd42c0234f04ec381561963bc9e93'
    );
  });
});

describe('warp bridge value helpers', () => {
  test('describeSequenceRoute reads the chain pair from the top byte', () => {
    assert.equal(describeSequenceRoute('1152921584303949596'), 'X1 → Solana');
    assert.equal(describeSequenceRoute('72058048760635936'), 'Solana → X1');
    // Legacy slot-based sequences carry no route.
    assert.equal(describeSequenceRoute('387252045000'), null);
    assert.equal(describeSequenceRoute(undefined), null);
  });

  test('describeRecoveryMode labels every RecoveryMode variant', () => {
    const variants = idl.types
      .find((type: { name: string }) => type.name === 'RecoveryMode')
      .type.variants.map((variant: { name: string }) => variant.name);
    for (const variant of variants) {
      assert.notEqual(describeRecoveryMode({ [variant]: {} }).description, undefined, variant);
    }
    assert.equal(describeRecoveryMode({ fullRecovery: {} }).label, 'Full recovery');
  });

  test('formatBytes32 rejects anything that is not 32 bytes', () => {
    assert.equal(formatBytes32(new Array(31).fill(0)), null);
    assert.equal(formatBytes32('not bytes'), null);
    assert.equal(formatBytes32(new Array(32).fill(255)), 'ff'.repeat(32));
  });

  test('formatUnixTime treats 0 as unset', () => {
    assert.equal(formatUnixTime(0), 'Not set');
    assert.equal(formatUnixTime(null), '—');
  });
});
