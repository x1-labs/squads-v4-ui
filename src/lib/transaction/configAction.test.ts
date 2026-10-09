import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import anchor from '@coral-xyz/anchor';
import { Keypair, PublicKey } from '@solana/web3.js';
import * as multisig from '@sqds/multisig';
import { NATIVE_MINT_ADDRESS, decodeConfigAction, formatUnits } from './configAction.ts';

const { ConfigTransaction } = multisig.accounts;
const { Period } = multisig.types;

/**
 * Serializes the actions in a ConfigTransaction account and reads them back,
 * so the decoder gets the same shapes as from `fromAccountAddress`: a BN
 * amount, a numeric period and PublicKey objects.
 */
function roundTrip(actions: multisig.types.ConfigAction[]) {
  const [data] = ConfigTransaction.fromArgs({
    multisig: Keypair.generate().publicKey,
    creator: Keypair.generate().publicKey,
    index: 1,
    bump: 255,
    actions,
  }).serialize();
  return ConfigTransaction.deserialize(data)[0].actions;
}

function decodeOne(action: multisig.types.ConfigAction) {
  return decodeConfigAction(roundTrip([action])[0], 'XNT');
}

const createKey = Keypair.generate().publicKey;
const member = Keypair.generate().publicKey;
const destination = Keypair.generate().publicKey;
const usdcMint = new PublicKey('EPjFWdd5AufqSSqeM2qJ1KHjZPQXcv4Mz4pzrRy5KQkW');

describe('decodeConfigAction: SetTimeLock', () => {
  test('shows the new time lock', () => {
    assert.deepEqual(decodeOne({ __kind: 'SetTimeLock', newTimeLock: 86_400 }), {
      type: 'Set Time Lock',
      newTimeLock: '1 d (86400 seconds)',
    });
  });

  test('shows zero, which removes the time lock', () => {
    assert.deepEqual(decodeOne({ __kind: 'SetTimeLock', newTimeLock: 0 }), {
      type: 'Set Time Lock',
      newTimeLock: 'None (0 seconds)',
    });
  });

  test('shows the raw data when newTimeLock is missing', () => {
    const decoded = decodeConfigAction({ __kind: 'SetTimeLock', timeLock: 3600 });
    assert.equal(decoded.type, 'Set Time Lock');
    assert.ok(decoded.error);
    assert.equal(decoded.newTimeLock, undefined);
    assert.deepEqual(decoded.rawData, { __kind: 'SetTimeLock', timeLock: 3600 });
  });
});

describe('decodeConfigAction: AddSpendingLimit', () => {
  test('native mint with no destinations', () => {
    const decoded = decodeOne({
      __kind: 'AddSpendingLimit',
      createKey,
      vaultIndex: 0,
      mint: PublicKey.default,
      amount: 1_500_000_000,
      period: Period.OneTime,
      members: [member],
      destinations: [],
    });
    assert.deepEqual(decoded, {
      type: 'Add Spending Limit',
      vaultIndex: 0,
      mint: `${NATIVE_MINT_ADDRESS} (native XNT)`,
      amount: '1.5 XNT',
      amountBaseUnits: '1500000000',
      period: 'One time',
      members: [member.toBase58()],
      destinations: 'Any address',
      createKey: createKey.toBase58(),
    });
  });

  test('SPL mint with destinations stays in base units', () => {
    const decoded = decodeOne({
      __kind: 'AddSpendingLimit',
      createKey,
      vaultIndex: 2,
      mint: usdcMint,
      amount: 250_000_000,
      period: Period.Week,
      members: [member, createKey],
      destinations: [destination],
    });
    assert.deepEqual(decoded, {
      type: 'Add Spending Limit',
      vaultIndex: 2,
      mint: usdcMint.toBase58(),
      amountBaseUnits: '250000000',
      period: 'Week',
      members: [member.toBase58(), createKey.toBase58()],
      destinations: [destination.toBase58()],
      createKey: createKey.toBase58(),
    });
  });

  test('keeps amounts above 2^53 exact', () => {
    const [action] = roundTrip([
      {
        __kind: 'AddSpendingLimit',
        createKey,
        vaultIndex: 0,
        mint: PublicKey.default,
        amount: new anchor.BN('18446744073709551615'),
        period: Period.Day,
        members: [member],
        destinations: [],
      },
    ]);
    const decoded = decodeConfigAction(action, 'SOL');
    assert.equal(decoded.amountBaseUnits, '18446744073709551615');
    assert.equal(decoded.amount, '18446744073.709551615 SOL');
  });

  test('shows every period by name', () => {
    const names = [Period.OneTime, Period.Day, Period.Week, Period.Month].map(
      (period) =>
        decodeOne({
          __kind: 'AddSpendingLimit',
          createKey,
          vaultIndex: 0,
          mint: usdcMint,
          amount: 1,
          period,
          members: [member],
          destinations: [],
        }).period
    );
    assert.deepEqual(names, ['One time', 'Day', 'Week', 'Month']);
  });

  test('shows the raw data for an unknown period', () => {
    const decoded = decodeConfigAction({
      __kind: 'AddSpendingLimit',
      createKey,
      vaultIndex: 0,
      mint: usdcMint,
      amount: 1,
      period: 7,
      members: [member],
      destinations: [],
    });
    assert.ok(decoded.error);
    assert.equal(decoded.period, undefined);
    assert.equal(decoded.rawData.period, 7);
  });

  test('shows the raw data for the old nested shape', () => {
    const decoded = decodeConfigAction({
      __kind: 'AddSpendingLimit',
      spendingLimit: { createKey, vaultIndex: 0, mint: usdcMint, amount: 1n },
    });
    assert.ok(decoded.error);
    assert.deepEqual(decoded.rawData, {
      __kind: 'AddSpendingLimit',
      spendingLimit: {
        createKey: createKey.toBase58(),
        vaultIndex: 0,
        mint: usdcMint.toBase58(),
        amount: '1',
      },
    });
  });
});

describe('decodeConfigAction: RemoveSpendingLimit', () => {
  test('shows the spending limit address', () => {
    const spendingLimit = Keypair.generate().publicKey;
    assert.deepEqual(decodeOne({ __kind: 'RemoveSpendingLimit', spendingLimit }), {
      type: 'Remove Spending Limit',
      spendingLimitKey: spendingLimit.toBase58(),
    });
  });

  test('shows the raw data when spendingLimit is missing', () => {
    const decoded = decodeConfigAction({ __kind: 'RemoveSpendingLimit' });
    assert.ok(decoded.error);
    assert.equal(decoded.spendingLimitKey, undefined);
  });
});

test('decoded actions survive JSON.stringify with no BN hex or bigint', () => {
  const actions = roundTrip([
    { __kind: 'SetTimeLock', newTimeLock: 60 },
    {
      __kind: 'AddSpendingLimit',
      createKey,
      vaultIndex: 1,
      mint: usdcMint,
      amount: 42,
      period: Period.Month,
      members: [member],
      destinations: [destination],
    },
    { __kind: 'RemoveSpendingLimit', spendingLimit: destination },
    { __kind: 'SetRentCollector', newRentCollector: destination },
  ]);
  const json = JSON.stringify(actions.map((action) => decodeConfigAction(action, 'XNT')));
  assert.ok(json.includes('"amountBaseUnits":"42"'));
  assert.ok(json.includes(`"newRentCollector":"${destination.toBase58()}"`));
  assert.ok(!json.includes('"amount":"2a"'));
  assert.doesNotThrow(() =>
    JSON.stringify(decodeConfigAction({ __kind: 'SetTimeLock', newTimeLock: 1n }))
  );
});

describe('formatUnits', () => {
  test('formats exact decimals with no rounding', () => {
    assert.equal(formatUnits(0n, 9), '0');
    assert.equal(formatUnits(1n, 9), '0.000000001');
    assert.equal(formatUnits(1_000_000_000n, 9), '1');
    assert.equal(formatUnits(1_234_567_891n, 9), '1.234567891');
  });
});
