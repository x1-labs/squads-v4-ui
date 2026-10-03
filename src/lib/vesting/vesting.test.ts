import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BN, BorshInstructionCoder } from '@coral-xyz/anchor';
import { Keypair, PublicKey } from '@solana/web3.js';
import {
  VESTING_PROGRAM_IDS,
  VESTING_PROGRAM_ID_LIST,
  getGrantPda,
  getLiquidVaultPda,
  getTreasuryPda,
  grantIdSeed,
} from './pdas.ts';
import {
  addCalendarMonths,
  checkGrantSchedule,
  formatExactNative,
  formatTimestamp,
  scheduleName,
} from './values.ts';
import { detectIdlFormat, isAnchorCompatible } from '../idls/idlFormats.ts';

const idl = JSON.parse(readFileSync(new URL('../idls/vesting.json', import.meta.url), 'utf8'));

// Vectors from `programs/vesting/src/instructions/common.rs` tests:
// 2025-10-06 20:13:28 UTC through 2029-10-06 20:13:28 UTC. (The comment next to
// them in the program repo says 19:13:28; the timestamps are 20:13:28 UTC.)
const START = 1_759_781_608;
const CLIFF = 1_791_317_608;
const END = 1_886_012_008;

describe('vesting program ids and PDAs', () => {
  test('registers every deployment profile', () => {
    assert.deepEqual(new Set(VESTING_PROGRAM_ID_LIST), new Set(Object.values(VESTING_PROGRAM_IDS)));
    assert.equal(VESTING_PROGRAM_ID_LIST.length, 3);
    for (const id of VESTING_PROGRAM_ID_LIST) assert.doesNotThrow(() => new PublicKey(id));
  });

  test('derives treasury, vault and grant PDAs with the program seeds', () => {
    const programId = new PublicKey(VESTING_PROGRAM_IDS.mainnetMonthly);
    assert.ok(
      getTreasuryPda(programId).equals(
        PublicKey.findProgramAddressSync([Buffer.from('treasury')], programId)[0]
      )
    );
    assert.ok(
      getLiquidVaultPda(programId).equals(
        PublicKey.findProgramAddressSync([Buffer.from('vault')], programId)[0]
      )
    );
    const le = Buffer.from([7, 0, 0, 0, 0, 0, 0, 0]);
    assert.ok(
      getGrantPda(programId, 7).equals(
        PublicKey.findProgramAddressSync([Buffer.from('grant'), le], programId)[0]
      )
    );
  });

  test('encodes grant ids as u64 little-endian and rejects out-of-range ids', () => {
    assert.deepEqual([...grantIdSeed(BigInt('18446744073709551615'))], Array(8).fill(255));
    assert.deepEqual([...grantIdSeed(258)], [2, 1, 0, 0, 0, 0, 0, 0]);
    assert.throws(() => grantIdSeed(-1), RangeError);
    assert.throws(() => grantIdSeed(BigInt('18446744073709551616')), RangeError);
  });
});

describe('vesting IDL', () => {
  test('is decoded by the Anchor path', () => {
    assert.ok(isAnchorCompatible(detectIdlFormat(idl).format));
  });

  test('round-trips the admin instructions a multisig proposes', () => {
    const coder = new BorshInstructionCoder(idl);
    const beneficiary = Keypair.generate().publicKey;

    const grant = coder.decode(
      coder.encode('create_grant', {
        grant_id: new BN(42),
        beneficiary,
        principal_total: new BN('1000000000000'),
        yield_total: new BN(5),
        start_ts: new BN(START),
        cliff_ts: new BN(CLIFF),
        end_ts: new BN(END),
      })
    );
    assert.equal(grant?.name, 'create_grant');
    const data = grant?.data as Record<string, any>;
    assert.equal(data.grant_id.toString(), '42');
    assert.ok(data.beneficiary.equals(beneficiary));
    assert.equal(data.principal_total.toString(), '1000000000000');
    assert.equal(data.cliff_ts.toString(), String(CLIFF));

    const newAdmin = Keypair.generate().publicKey;
    const transfer = coder.decode(coder.encode('transfer_admin', { new_admin: newAdmin }));
    assert.equal(transfer?.name, 'transfer_admin');
    assert.ok((transfer?.data as any).new_admin.equals(newAdmin));

    const pause = coder.decode(coder.encode('pause', { paused: true }));
    assert.equal(pause?.name, 'pause');
    assert.equal((pause?.data as any).paused, true);

    const init = coder.decode(
      coder.encode('initialize_treasury', { principal_schedule: { Monthly: {} } })
    );
    assert.equal(scheduleName((init?.data as any).principal_schedule), 'Monthly');
  });
});

describe('vesting schedule rules', () => {
  test('calendar month addition matches the program', () => {
    assert.equal(addCalendarMonths(START, 12), CLIFF);
    assert.equal(addCalendarMonths(START, 48), END);
    // 2024-01-31 00:00 UTC clamps to leap day in February.
    assert.equal(addCalendarMonths(1_706_659_200, 1), 1_709_164_800);
  });

  test('accepts valid grants and flags ones create_grant would reject', () => {
    assert.deepEqual(checkGrantSchedule('Monthly', START, CLIFF, END), { valid: true });
    assert.equal(checkGrantSchedule('Monthly', START, CLIFF + 1, END).valid, false);
    assert.equal(checkGrantSchedule('Monthly', START, CLIFF, END - 1).valid, false);
    assert.deepEqual(checkGrantSchedule('Linear', START, START + 10, START + 20), { valid: true });
    assert.equal(checkGrantSchedule('Linear', START, START - 1, START + 20).valid, false);
    assert.equal(checkGrantSchedule('Linear', START, START, START).valid, false);
  });

  test('formats exact native amounts and UTC timestamps', () => {
    assert.equal(formatExactNative(BigInt('1234567890123'), 'XNT'), '1,234.567890123 XNT');
    assert.equal(formatExactNative(new BN(5_000_000_000), 'XNT'), '5 XNT');
    assert.equal(formatTimestamp(new BN(START)), '2025-10-06 20:13 UTC');
  });
});
