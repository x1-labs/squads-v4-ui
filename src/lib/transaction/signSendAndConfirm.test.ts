import { afterEach, beforeEach, describe, mock, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ComputeBudgetInstruction,
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
  VersionedTransaction,
} from '@solana/web3.js';
import type { Connection } from '@solana/web3.js';
import {
  SimulationFailedError,
  WalletSignatureTimeoutError,
  signSendAndConfirm,
  signSendAndConfirmV0,
} from './signSendAndConfirm.ts';
import type { SendStep, SigningWallet } from './signSendAndConfirm.ts';

const keypair = Keypair.generate();
const program = Keypair.generate().publicKey;
const ix = (bytes = 8) =>
  new TransactionInstruction({ keys: [], programId: program, data: Buffer.alloc(bytes, 1) });

/** A wallet that really signs, so the pipeline's serialize() of the result is valid. */
function fakeWallet() {
  const signed: (Transaction | VersionedTransaction)[] = [];
  const wallet: SigningWallet = {
    publicKey: keypair.publicKey,
    signTransaction: async (transaction) => {
      signed.push(transaction);
      if (transaction instanceof VersionedTransaction) transaction.sign([keypair]);
      else transaction.sign(keypair);
      return transaction;
    },
  };
  return { wallet, signed };
}

function fakeConnection({
  fees = [0, 0, 5_000, 5_000],
  simulation = { err: null, logs: [], unitsConsumed: 30_000 } as
    | { err: unknown; logs: string[]; unitsConsumed?: number }
    | (() => never),
  blockHeight = (() => 100) as () => number,
} = {}) {
  const calls = { simulations: 0, sends: 0 };
  const connection = {
    rpcEndpoint: 'http://rpc.test',
    getRecentPrioritizationFees: async () =>
      fees.map((prioritizationFee) => ({ prioritizationFee })),
    simulateTransaction: async () => {
      calls.simulations += 1;
      const value = typeof simulation === 'function' ? simulation() : simulation;
      return { value };
    },
    getLatestBlockhash: async () => ({
      blockhash: PublicKey.default.toBase58(),
      lastValidBlockHeight: 999,
    }),
    sendRawTransaction: async () => {
      calls.sends += 1;
      return 'SIGabc';
    },
    getSignatureStatuses: async () => ({ value: [{ err: null, confirmationStatus: 'confirmed' }] }),
    getBlockHeight: async () => blockHeight(),
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

/** [limit, price] from the first two instructions of what the wallet was handed. */
function budgetOf(transaction: Transaction | VersionedTransaction): [number, number] {
  if (transaction instanceof Transaction) {
    return [
      ComputeBudgetInstruction.decodeSetComputeUnitLimit(transaction.instructions[0]).units,
      Number(
        ComputeBudgetInstruction.decodeSetComputeUnitPrice(transaction.instructions[1])
          .microLamports
      ),
    ];
  }
  const [limit, price] = transaction.message.compiledInstructions;
  assert.equal(limit.data[0], 2, 'SetComputeUnitLimit discriminator');
  assert.equal(price.data[0], 3, 'SetComputeUnitPrice discriminator');
  return [
    Buffer.from(limit.data).readUInt32LE(1),
    Number(Buffer.from(price.data).readBigUInt64LE(1)),
  ];
}

const options = { writableAccounts: [program], label: 'test' };

describe('signSendAndConfirm', () => {
  beforeEach(() => mock.timers.enable({ apis: ['setTimeout', 'Date'] }));
  afterEach(() => mock.timers.reset());

  test('prepends a compute budget sized from its own simulation and priced from the market', async () => {
    const { connection, calls } = fakeConnection();
    const { wallet, signed } = fakeWallet();
    const signature = await run(signSendAndConfirm(connection, wallet, [ix()], options));
    assert.equal(signature, 'SIGabc');
    assert.equal(calls.simulations, 1);
    assert.equal(signed.length, 1);
    assert.deepEqual(budgetOf(signed[0]), [36_600, 5_000]);
    assert.equal((signed[0] as Transaction).instructions.length, 3);
  });

  test('skips simulation when the caller already measured', async () => {
    const { connection, calls } = fakeConnection();
    const { wallet, signed } = fakeWallet();
    await run(
      signSendAndConfirm(connection, wallet, [ix()], { ...options, unitsConsumed: 10_000 })
    );
    assert.equal(calls.simulations, 0);
    assert.equal(budgetOf(signed[0])[0], 12_600);
  });

  test('a failing simulation stops before the wallet is asked, with the program error', async () => {
    const { connection, calls } = fakeConnection({
      simulation: {
        err: { InstructionError: [0, { Custom: 6006 }] },
        logs: [
          'Program log: AnchorError occurred. Error Code: AlreadyApproved. Error Number: 6006. Error Message: Member already approved the transaction.',
        ],
      },
    });
    const { wallet, signed } = fakeWallet();
    const error = await rejects(signSendAndConfirm(connection, wallet, [ix()], options));
    assert.ok(error instanceof SimulationFailedError);
    assert.equal(error.message, 'Member already approved the transaction (AlreadyApproved)');
    assert.equal(signed.length, 0);
    assert.equal(calls.sends, 0);
  });

  test('a simulation that cannot run falls back to the runtime default budget', async () => {
    const { connection } = fakeConnection({
      simulation: () => {
        throw new Error('429 Too Many Requests');
      },
    });
    const { wallet, signed } = fakeWallet();
    await run(signSendAndConfirm(connection, wallet, [ix(), ix(), ix()], options));
    assert.equal(
      budgetOf(signed[0])[0],
      600_000,
      '200k per instruction, as the runtime would grant'
    );
  });

  test('an oversize transaction is rejected before signing, with the caller hint', async () => {
    const { connection } = fakeConnection();
    const { wallet, signed } = fakeWallet();
    const error = await rejects(
      signSendAndConfirm(connection, wallet, [ix(700), ix(700)], {
        ...options,
        tooLargeHint: 'Select fewer proposals.',
      })
    );
    assert.match(
      error.message,
      /^Transaction too large \(over 1232 bytes\)\. Select fewer proposals\.$/
    );
    assert.equal(signed.length, 0);
  });

  test('reports each step in order', async () => {
    const { connection } = fakeConnection();
    const { wallet } = fakeWallet();
    const steps: SendStep[] = [];
    await run(
      signSendAndConfirm(connection, wallet, [ix()], { ...options, onStep: (s) => steps.push(s) })
    );
    assert.deepEqual(steps, ['preparing', 'signing', 'confirming']);
  });
});

describe('signSendAndConfirmV0', () => {
  beforeEach(() => mock.timers.enable({ apis: ['setTimeout', 'Date'] }));
  afterEach(() => mock.timers.reset());

  test('builds a v0 transaction with the same budget in front', async () => {
    const { connection } = fakeConnection();
    const { wallet, signed } = fakeWallet();
    const signature = await run(signSendAndConfirmV0(connection, wallet, [ix(), ix()], options));
    assert.equal(signature, 'SIGabc');
    assert.ok(signed[0] instanceof VersionedTransaction);
    assert.deepEqual(budgetOf(signed[0]), [36_600, 5_000]);
    assert.equal((signed[0] as VersionedTransaction).message.compiledInstructions.length, 4);
  });

  test('sizes the packet with the budget instructions included', async () => {
    const { connection } = fakeConnection();
    const { wallet, signed } = fakeWallet();
    const error = await rejects(
      signSendAndConfirmV0(connection, wallet, [ix(1150)], {
        ...options,
        tooLargeHint: 'Remove some operations and try again.',
      })
    );
    assert.match(
      error.message,
      /^Transaction too large \(over 1232 bytes\)\. Remove some operations/
    );
    assert.equal(signed.length, 0);
  });
});

describe('wallet watchdog', () => {
  beforeEach(() => mock.timers.enable({ apis: ['setTimeout', 'Date'] }));
  afterEach(() => mock.timers.reset());

  test('a wallet that never answers is abandoned once the blockhash dies, and nothing is sent', async () => {
    // Height passes lastValidBlockHeight (999) after ~40s of waiting.
    const start = Date.now();
    const { calls, connection } = fakeConnection({
      blockHeight: () => (Date.now() - start > 40_000 ? 1_000 : 900),
    });
    const wallet: SigningWallet = {
      publicKey: keypair.publicKey,
      signTransaction: () => new Promise(() => {}),
    };
    const error = await rejects(signSendAndConfirm(connection, wallet, [ix()], { label: 't' }));
    assert.ok(error instanceof WalletSignatureTimeoutError, String(error));
    assert.match(error.message, /Nothing was sent/);
    assert.equal(calls.sends, 0);
  });

  test('a wallet that answers late, after expiry, is not sent either', async () => {
    const start = Date.now();
    const { calls, connection } = fakeConnection({
      blockHeight: () => (Date.now() - start > 40_000 ? 1_000 : 900),
    });
    const { wallet } = fakeWallet();
    const slowSign = wallet.signTransaction!;
    wallet.signTransaction = (transaction) =>
      new Promise((resolve) => setTimeout(() => resolve(slowSign(transaction)), 90_000));
    const error = await rejects(signSendAndConfirm(connection, wallet, [ix()], { label: 't' }));
    assert.ok(error instanceof WalletSignatureTimeoutError, String(error));
    assert.equal(calls.sends, 0);
  });

  test('a wallet that answers in time is sent normally', async () => {
    const { calls, connection } = fakeConnection({ blockHeight: () => 900 });
    const { wallet } = fakeWallet();
    const quickSign = wallet.signTransaction!;
    wallet.signTransaction = (transaction) =>
      new Promise((resolve) => setTimeout(() => resolve(quickSign(transaction)), 14_000));
    assert.equal(
      await run(signSendAndConfirm(connection, wallet, [ix()], { label: 't' })),
      'SIGabc'
    );
    assert.equal(calls.sends, 1);
  });
});
