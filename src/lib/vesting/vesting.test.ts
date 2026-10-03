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
import { addCalendarMonths, checkGrantSchedule, formatTimestamp, scheduleName } from './values.ts';
import {
  ANCHOR_ERRORS,
  U64_MAX,
  VESTING_ERRORS,
  checkAccountFree,
  checkAdminGuards,
  checkTreasuryAccount,
  checkU64,
  checkCoverage,
  checkGrantUntouched,
  checkVaultAccount,
  emptyPreflight,
  willFail,
  type TreasuryFacts,
} from './preflight.ts';
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
    const b = BigInt;
    assert.deepEqual(checkGrantSchedule('Monthly', b(START), b(CLIFF), b(END)), {
      status: 'valid',
    });
    assert.equal(checkGrantSchedule('Monthly', b(START), b(CLIFF + 1), b(END)).status, 'invalid');
    assert.equal(checkGrantSchedule('Monthly', b(START), b(CLIFF), b(END - 1)).status, 'invalid');
    assert.deepEqual(checkGrantSchedule('Linear', b(START), b(START + 10), b(START + 20)), {
      status: 'valid',
    });
    assert.equal(
      checkGrantSchedule('Linear', b(START), b(START - 1), b(START + 20)).status,
      'invalid'
    );
    assert.equal(checkGrantSchedule('Linear', b(START), b(START), b(START)).status, 'invalid');
  });

  test('never claims a schedule passes when it cannot check it', () => {
    const huge = BigInt('9000000000000000');
    // Ordering is still exact for any i64.
    assert.equal(
      checkGrantSchedule('Monthly', huge, huge - BigInt(1), huge + BigInt(1)).status,
      'invalid'
    );
    // The calendar rule cannot be evaluated outside the Date range.
    assert.equal(
      checkGrantSchedule('Monthly', huge, huge + BigInt(1), huge + BigInt(2)).status,
      'unverified'
    );
    // Unknown treasury schedule is unverified, not valid.
    assert.equal(
      checkGrantSchedule(null, BigInt(START), BigInt(CLIFF), BigInt(END)).status,
      'unverified'
    );
  });

  test('calendar math handles years 0–99 and unrepresentable results', () => {
    // 0050-01-31 00:00 UTC + 1 month clamps to 0050-02-28, not to a 1950 date.
    const start = new Date(0);
    start.setUTCFullYear(50, 0, 31);
    const expected = new Date(0);
    expected.setUTCFullYear(50, 1, 28);
    assert.equal(addCalendarMonths(start.getTime() / 1000, 1), expected.getTime() / 1000);
    // Start near the end of the Date range: +48 months cannot be represented.
    const nearMax = BigInt(8_639_990_000_000);
    assert.equal(
      checkGrantSchedule('Monthly', nearMax, nearMax + BigInt(1), nearMax + BigInt(2)).status,
      'unverified'
    );
  });

  test('labels far-future years, which usually mean milliseconds', () => {
    assert.match(formatTimestamp(new BN('1759781608000')), /milliseconds instead of seconds/);
    assert.doesNotMatch(formatTimestamp(new BN(START)), /milliseconds/);
  });

  test('formats UTC timestamps and never throws on out-of-range i64s', () => {
    assert.equal(formatTimestamp(new BN(START)), '2025-10-06 20:13 UTC');
    assert.equal(formatTimestamp(new BN('9000000000000000')), '9000000000000000 (out of range)');
    assert.equal(
      formatTimestamp(new BN('-9223372036854775808')),
      '-9223372036854775808 (out of range)'
    );
    assert.equal(formatTimestamp(undefined), '—');
  });
});

describe('vesting preflight', () => {
  const admin = Keypair.generate().publicKey.toBase58();
  const vault = getLiquidVaultPda(VESTING_PROGRAM_IDS.mainnetMonthly).toBase58();
  const treasury = (overrides: Partial<TreasuryFacts> = {}): TreasuryFacts => ({
    admin,
    paused: false,
    claimsActive: false,
    liquidVault: vault,
    outstanding: BigInt(100),
    ...overrides,
  });

  test('error codes match the IDL', () => {
    const fromIdl = Object.fromEntries(idl.errors.map((e: any) => [e.name, e.code]));
    assert.deepEqual({ ...VESTING_ERRORS }, fromIdl);
  });

  test('rejects a signer that is not the treasury admin with the has_one constraint error', () => {
    const result = emptyPreflight();
    checkAdminGuards(result, treasury(), Keypair.generate().publicKey.toBase58(), false);
    assert.deepEqual(
      result.rejections.map((r) => r.code),
      [ANCHOR_ERRORS.ConstraintHasOne]
    );
  });

  test('rejects a treasury account that is not the treasury PDA', () => {
    const pda = getTreasuryPda(VESTING_PROGRAM_IDS.mainnetMonthly).toBase58();
    const wrong = emptyPreflight();
    checkTreasuryAccount(wrong, Keypair.generate().publicKey.toBase58(), pda);
    assert.deepEqual(
      wrong.rejections.map((r) => r.code),
      [ANCHOR_ERRORS.ConstraintSeeds]
    );
    const right = emptyPreflight();
    checkTreasuryAccount(right, pda, pda);
    assert.equal(willFail(right), false);
  });

  test('init checks reject existing accounts and leave failed reads unverified', () => {
    const taken = emptyPreflight();
    checkAccountFree(taken, true, 'Grant #1');
    assert.deepEqual(
      taken.rejections.map((r) => r.error),
      ['AccountAlreadyInUse']
    );
    const unknown = emptyPreflight();
    checkAccountFree(unknown, null, 'Grant #1');
    assert.equal(willFail(unknown), false);
    assert.equal(unknown.unverified.length, 1);
    const free = emptyPreflight();
    checkAccountFree(free, false, 'Grant #1');
    assert.equal(willFail(free) || free.unverified.length > 0, false);
  });

  test('flags u64 overflow the program would raise as MathOverflow', () => {
    const over = emptyPreflight();
    checkU64(over, U64_MAX + BigInt(1), 'Principal plus yield');
    assert.deepEqual(
      over.rejections.map((r) => r.code),
      [VESTING_ERRORS.MathOverflow]
    );
    const max = emptyPreflight();
    checkU64(max, U64_MAX, 'Principal plus yield');
    assert.equal(willFail(max), false);
  });

  test('rejects pause-gated instructions while paused, but not pause/transfer_admin', () => {
    const gated = emptyPreflight();
    checkAdminGuards(gated, treasury({ paused: true }), admin, true);
    assert.deepEqual(
      gated.rejections.map((r) => r.error),
      ['Paused']
    );

    const ungated = emptyPreflight();
    checkAdminGuards(ungated, treasury({ paused: true }), admin, false);
    assert.equal(willFail(ungated), false);
  });

  test('reports unreadable state as unverified, never as passing', () => {
    const result = emptyPreflight();
    checkAdminGuards(result, null, admin, true);
    checkCoverage(result, null, BigInt(1), 'everything owed');
    checkGrantUntouched(result, null);
    assert.equal(willFail(result), false);
    assert.equal(result.unverified.length, 3);
  });

  test('checks vault coverage', () => {
    const short = emptyPreflight();
    checkCoverage(short, BigInt(99), BigInt(100), 'everything owed');
    assert.deepEqual(
      short.rejections.map((r) => r.error),
      ['InsufficientVaultBalance']
    );

    const covered = emptyPreflight();
    checkCoverage(covered, BigInt(100), BigInt(100), 'everything owed');
    assert.equal(willFail(covered), false);
  });

  test('cancel/replace need an Active grant with no claims', () => {
    const canceled = emptyPreflight();
    checkGrantUntouched(canceled, { status: 'Canceled', hasClaims: false });
    assert.deepEqual(
      canceled.rejections.map((r) => r.error),
      ['InvalidState']
    );

    const claimed = emptyPreflight();
    checkGrantUntouched(claimed, { status: 'Active', hasClaims: true });
    assert.deepEqual(
      claimed.rejections.map((r) => r.error),
      ['AlreadyHasActivity']
    );

    const ok = emptyPreflight();
    checkGrantUntouched(ok, { status: 'Active', hasClaims: false });
    assert.equal(willFail(ok), false);
  });

  test('rejects a vault account that is not the treasury vault PDA', () => {
    const wrong = emptyPreflight();
    checkVaultAccount(wrong, treasury(), Keypair.generate().publicKey.toBase58(), vault);
    assert.deepEqual(
      wrong.rejections.map((r) => r.error),
      ['ConstraintAddress']
    );

    const right = emptyPreflight();
    checkVaultAccount(right, treasury(), vault, vault);
    assert.equal(willFail(right), false);
  });
});
