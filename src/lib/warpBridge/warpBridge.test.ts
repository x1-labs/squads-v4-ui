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

describe('warp bridge preflight', async () => {
  const preflightModule = await import('./preflight.ts');
  const {
    applyPriorEffects,
    checkAuthority,
    checkIncident,
    checkInboundRoute,
    checkRecoveryMode,
    checkRecoveryPause,
    checkRootHasOne,
    checkSettleable,
    checkTokenLimits,
    checkAccountFree,
    emptyPreflight,
    unknownFacts,
    willFail,
    MANUAL_REVIEW_PENDING,
  } = preflightModule;

  const PROGRAM = '6JbPTuxVuoTgyQeXFb9MH8C8nUY8NBbLP1Lu4B13JfMD';
  const ROOT = '2sXr5THr5ZAwSfuJAc1KogPKZ2uKkhfNUAtEvNw5Q6Z7';
  const OPS = 'Ops1111111111111111111111111111111111111111';
  const PAUSER = 'Pause111111111111111111111111111111111111111';
  const REGISTRY = '2etcJKUTfuRegistry1111111111111111111111111';

  const x1Facts = () => ({
    ...unknownFacts(),
    admin: ROOT,
    configPaused: false,
    chainId: 1,
    manualReviewEnabled: false,
    roles: { operationsAdmin: OPS, pauser: PAUSER },
    recoveryMode: null,
    tokenPaused: { [REGISTRY]: false },
  });

  const ix = (instructionName: string, args: Record<string, unknown>, accounts: string[] = []) =>
    ({
      programId: PROGRAM,
      instructionName,
      args,
      accounts: accounts.map((pubkey, i) => ({
        name: i === 1 ? 'token_registry' : `a${i}`,
        pubkey,
      })),
    }) as any;

  test('error codes match the bundled IDL', () => {
    const fromIdl = Object.fromEntries(
      idl.errors.map((error: { name: string; code: number }) => [error.name, error.code])
    );
    for (const [name, code] of Object.entries(preflightModule.BRIDGE_ERRORS)) {
      assert.equal(code, fromIdl[name], name);
    }
  });

  test('#188 cancellation passes once its earlier instructions are applied', () => {
    const prior = [
      ix('InitializeRecoveryPolicy', {}),
      ix('SetTokenPause', { paused: true }, ['config', REGISTRY]),
      ix('SetRecoveryMode', { mode: { cancellationOnly: {} } }),
    ];
    const facts = applyPriorEffects(x1Facts(), prior, PROGRAM);
    const result = emptyPreflight();
    checkRootHasOne(result, facts, ROOT);
    checkRecoveryMode(result, facts, 'cancel');
    checkRecoveryPause(result, facts, REGISTRY);
    checkIncident(result, 0, new Array(32).fill(7));
    checkInboundRoute(result, facts, '72058048760635936');
    checkAccountFree(result, false, 'A delivery receipt', 'DestinationAlreadyExecuted');
    assert.deepEqual(result.rejections, []);
    assert.deepEqual(result.unverified, []);
  });

  test('the same cancellation alone is rejected for mode and pause', () => {
    const result = emptyPreflight();
    const facts = x1Facts();
    checkRecoveryMode(result, facts, 'cancel');
    checkRecoveryPause(result, facts, REGISTRY);
    assert.deepEqual(
      result.rejections.map((r) => r.error),
      ['AccountNotInitialized', 'RecoveryRequiresPause']
    );
  });

  test('an already delivered transfer cannot be cancelled', () => {
    const result = emptyPreflight();
    checkAccountFree(result, true, 'A delivery receipt', 'DestinationAlreadyExecuted');
    assert.equal(result.rejections[0].error, 'DestinationAlreadyExecuted');
    assert.equal(result.rejections[0].code, 6055);
  });

  test('failed reads are unverified, never passing', () => {
    const result = emptyPreflight();
    const facts = unknownFacts();
    checkRootHasOne(result, facts, ROOT);
    checkRecoveryMode(result, facts, 'cancel');
    checkRecoveryPause(result, facts, REGISTRY);
    checkInboundRoute(result, facts, '72058048760635936');
    checkAccountFree(result, undefined, 'A delivery receipt');
    assert.equal(willFail(result), false);
    assert.equal(result.unverified.length, 5);
  });

  test('authority tiers match auth.rs', () => {
    const facts = x1Facts();
    const outcome = (signer: string, tier: 'root' | 'operations' | 'pauser') => {
      const result = emptyPreflight();
      checkAuthority(result, facts, signer, tier, 'Unauthorized');
      return willFail(result);
    };
    assert.equal(outcome(ROOT, 'root'), false);
    assert.equal(outcome(OPS, 'root'), true);
    assert.equal(outcome(OPS, 'operations'), false);
    assert.equal(outcome(PAUSER, 'operations'), true);
    assert.equal(outcome(PAUSER, 'pauser'), false);

    const noRoles = { ...facts, roles: null };
    const result = emptyPreflight();
    checkAuthority(result, noRoles, OPS, 'operations', 'Unauthorized');
    assert.equal(willFail(result), true);
  });

  test('reversal needs Full recovery; cancellation accepts either enabled mode', () => {
    const cancel = emptyPreflight();
    checkRecoveryMode(cancel, { ...x1Facts(), recoveryMode: 'CancellationOnly' }, 'cancel');
    assert.equal(willFail(cancel), false);
    const reverse = emptyPreflight();
    checkRecoveryMode(reverse, { ...x1Facts(), recoveryMode: 'CancellationOnly' }, 'reverse');
    assert.equal(reverse.rejections[0].error, 'ReversalPolicyDisabled');
  });

  test('route, incident and limit guards', () => {
    const facts = x1Facts();
    const wrongChain = emptyPreflight();
    checkInboundRoute(wrongChain, facts, '1152921584303949596');
    assert.equal(wrongChain.rejections[0].error, 'InvalidDestinationChain');

    const legacy = emptyPreflight();
    checkInboundRoute(legacy, facts, '387252045000');
    assert.equal(legacy.rejections[0].error, 'InvalidDestinationChain');

    const incident = emptyPreflight();
    checkIncident(incident, 32, new Array(32).fill(0));
    assert.deepEqual(
      incident.rejections.map((r) => r.error),
      ['InvalidIncidentId', 'InvalidRecoveryReason']
    );

    const limits = emptyPreflight();
    checkTokenLimits(limits, 100, 50);
    assert.equal(limits.rejections[0].error, 'InvalidAmountLimits');
    const unbounded = emptyPreflight();
    checkTokenLimits(unbounded, 100, 0);
    assert.equal(willFail(unbounded), false);
  });

  const SENDER = '4VR2XrUfr8KY8LYLqT2taaE4L1hXJDmTZxYUTeCgL9wn';
  const MINT = 'B69chRzqzDCmdB5WYB8NRu5Yv5ZA95ABiZcdzCgGm9Tq';
  const incomingBase = { processed: true, claimed: false, sender: SENDER, tokenMint: MINT };

  test('settle_delayed rejects held, unreleased and immature transfers', () => {
    const facts = x1Facts();
    const held = emptyPreflight();
    checkSettleable(held, facts, { ...incomingBase, claimableAfter: MANUAL_REVIEW_PENDING }, 1_000);
    assert.equal(held.rejections[0].error, 'ManualHoldNotReleased');

    const early = emptyPreflight();
    checkSettleable(early, facts, { ...incomingBase, claimableAfter: BigInt(2_000) }, 1_000);
    assert.equal(early.rejections[0].error, 'DelayNotElapsed');

    const ready = emptyPreflight();
    checkSettleable(ready, facts, { ...incomingBase, claimableAfter: BigInt(500) }, 1_000);
    assert.equal(willFail(ready), false);
  });

  test('settle_delayed reports unread state as unverified', () => {
    const result = emptyPreflight();
    checkSettleable(
      result,
      unknownFacts(),
      { ...incomingBase, claimableAfter: BigInt(500) },
      1_000
    );
    assert.equal(willFail(result), false);
    assert.ok(result.unverified.some((note) => note.includes('Manual review')));
  });

  test('payout accounts must match the transfer', () => {
    const incoming = { ...incomingBase, claimableAfter: BigInt(0) };
    const wrong = emptyPreflight();
    preflightModule.checkPayoutAccounts(
      wrong,
      incoming,
      { recipient: OPS, tokenMint: PAUSER, registryMint: REGISTRY },
      'MintMismatch'
    );
    assert.deepEqual(
      wrong.rejections.map((r) => r.error),
      ['RecipientMismatch', 'MintMismatch', 'MintMismatch']
    );
    const right = emptyPreflight();
    preflightModule.checkPayoutAccounts(
      right,
      incoming,
      { recipient: SENDER, tokenMint: MINT, registryMint: MINT },
      'MintMismatch'
    );
    assert.deepEqual(right.rejections, []);
    assert.deepEqual(right.unverified, []);
  });

  test('the roles slot follows Anchor optional-account rules', () => {
    const { resolveRolesSlot } = preflightModule;
    const ROLES_PDA = 'HFWg6MpqBr446bGUqDxpr3sCQ5B92uCbTj7RUZa2aS6v';
    const facts = x1Facts();

    // Program ID in the slot means None: the operations admin is no longer recognized.
    const none = emptyPreflight();
    const noneRoles = resolveRolesSlot(none, facts, PROGRAM, PROGRAM, ROLES_PDA);
    checkAuthority(none, facts, OPS, 'operations', 'Unauthorized', noneRoles);
    assert.equal(none.rejections[0].error, 'Unauthorized');

    const uninitialized = emptyPreflight();
    resolveRolesSlot(uninitialized, { ...facts, roles: null }, ROLES_PDA, PROGRAM, ROLES_PDA);
    assert.equal(uninitialized.rejections[0].error, 'AccountNotInitialized');

    const wrong = emptyPreflight();
    resolveRolesSlot(wrong, facts, OPS, PROGRAM, ROLES_PDA);
    assert.equal(wrong.rejections[0].error, 'ConstraintSeeds');

    const ok = emptyPreflight();
    const roles = resolveRolesSlot(ok, facts, ROLES_PDA, PROGRAM, ROLES_PDA);
    checkAuthority(ok, facts, OPS, 'operations', 'Unauthorized', roles);
    assert.deepEqual(ok.rejections, []);
  });

  test('earlier admin, role, registry and chain changes are applied', () => {
    const prior = [
      ix('UpdateTokenRegistry', { paused: false }, ['config', REGISTRY]),
      ix('TransferAdmin', { new_admin: OPS }),
      ix('SetRole', { role_type: { pauser: {} }, pubkey: null }),
      ix('SetChainId', { chain_id: 0 }),
    ];
    const facts = applyPriorEffects(
      { ...x1Facts(), tokenPaused: { [REGISTRY]: true } },
      prior,
      PROGRAM
    );
    assert.equal(facts.tokenPaused[REGISTRY], false);
    assert.equal(facts.admin, OPS);
    assert.equal(facts.roles?.pauser, null);
    assert.equal(facts.chainId, 0);

    // Un-pausing the token earlier makes a later cancellation fail the pause rule.
    const result = emptyPreflight();
    checkRecoveryPause(result, facts, REGISTRY);
    assert.equal(result.rejections[0].error, 'RecoveryRequiresPause');
  });

  test('an undecodable earlier argument makes the fact unknown', () => {
    const facts = applyPriorEffects(
      x1Facts(),
      [ix('SetTokenPause', { paused: 'yes' }, ['config', REGISTRY])],
      PROGRAM
    );
    assert.equal(facts.tokenPaused[REGISTRY], undefined);
  });

  test('outbound route: this chain must be the source', () => {
    const { checkOutboundRoute } = preflightModule;
    const facts = x1Facts(); // chain 1 (X1)
    const fromX1 = emptyPreflight();
    checkOutboundRoute(fromX1, facts, '1152921584303949596');
    assert.deepEqual(fromX1.rejections, []);
    const fromSolana = emptyPreflight();
    checkOutboundRoute(fromSolana, facts, '72058048760635936');
    assert.equal(fromSolana.rejections[0].error, 'InvalidSourceChain');
  });

  test('a proof field that cannot be decoded is unverified, not skipped', () => {
    const result = emptyPreflight();
    preflightModule.checkCancellationProof(
      result,
      {
        consumed: false,
        sourceSeq: null,
        guardianSetIndex: null,
        signatureCount: null,
        destinationCancellation: null,
        reasonCode: null,
        incidentId: null,
      },
      { seq: '1', destinationCancellation: OPS, reasonCode: 0, incidentId: new Array(32).fill(1) },
      { index: 3, threshold: 5 }
    );
    assert.equal(willFail(result), false);
    assert.equal(result.unverified.length, 5);
  });
});

test('an unreadable Roles PDA in the roles slot is unverified even for root', async () => {
  const { resolveRolesSlot, emptyPreflight, unknownFacts, willFail } = await import(
    './preflight.ts'
  );
  const PROGRAM = '6JbPTuxVuoTgyQeXFb9MH8C8nUY8NBbLP1Lu4B13JfMD';
  const ROLES_PDA = 'HFWg6MpqBr446bGUqDxpr3sCQ5B92uCbTj7RUZa2aS6v';
  const result = emptyPreflight();
  resolveRolesSlot(result, unknownFacts(), ROLES_PDA, PROGRAM, ROLES_PDA);
  assert.equal(willFail(result), false);
  assert.equal(result.unverified.length, 1);
});
