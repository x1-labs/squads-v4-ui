import { afterEach, beforeEach, describe, mock, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ComputeBudgetInstruction,
  Keypair,
  PublicKey,
  SendTransactionError,
  Transaction,
  TransactionInstruction,
  VersionedTransaction,
} from '@solana/web3.js';
import type { Connection } from '@solana/web3.js';
import { WalletSignTransactionError } from '@solana/wallet-adapter-base';
import {
  SignedAfterExpiryError,
  SimulationFailedError,
  WalletAccountMismatchError,
  WalletBlockhashUnknownError,
  WalletChangedCoSignedTransactionError,
  WalletSignatureTimeoutError,
  describeSendError,
  isWalletAccountMismatch,
  signSendAndConfirm,
  signSendAndConfirmV0,
} from './signSendAndConfirm.ts';
import type { SendStep, SigningWallet } from './signSendAndConfirm.ts';
import { formatError } from '../utils/errorHandler.ts';
import bs58 from 'bs58';

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
  /** Signature status per poll, by poll number (1-based). Defaults to confirmed at once. */
  status = (() => ({ err: null, confirmationStatus: 'confirmed' })) as (
    poll: number
  ) => { err: null; confirmationStatus: string } | null,
  send = (() => 'SIGabc') as () => string,
  latest = (() => ({
    blockhash: PublicKey.default.toBase58(),
    lastValidBlockHeight: 999,
  })) as () => {
    blockhash: string;
    lastValidBlockHeight: number;
  },
} = {}) {
  const calls = { simulations: 0, sends: 0, statusPolls: 0, sent: [] as Uint8Array[] };
  const connection = {
    rpcEndpoint: 'http://rpc.test',
    getRecentPrioritizationFees: async () =>
      fees.map((prioritizationFee) => ({ prioritizationFee })),
    simulateTransaction: async () => {
      calls.simulations += 1;
      const value = typeof simulation === 'function' ? simulation() : simulation;
      return { value };
    },
    getLatestBlockhash: async () => latest(),
    sendRawTransaction: async (raw: Uint8Array) => {
      calls.sends += 1;
      calls.sent.push(raw);
      return send();
    },
    getSignatureStatuses: async () => ({ value: [status(++calls.statusPolls)] }),
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

/** The signature the pipeline should report: the wallet's own, off the signed bytes. */
const signatureOf = (transaction: Transaction | VersionedTransaction): string =>
  bs58.encode(
    transaction instanceof VersionedTransaction
      ? transaction.signatures[0]
      : (transaction.signature as Buffer)
  );

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
    assert.equal(calls.simulations, 1);
    assert.equal(signed.length, 1);
    assert.equal(signature, signatureOf(signed[0]));
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

  test('a user-chosen fee replaces the market lookup', async () => {
    const { connection } = fakeConnection({ fees: [50_000, 50_000] });
    const { wallet, signed } = fakeWallet();
    await run(
      signSendAndConfirm(connection, wallet, [ix()], { ...options, priorityFeeMicroLamports: 7 })
    );
    assert.equal(budgetOf(signed[0])[1], 7);
  });

  test('a minimum compute budget is a floor under the measured size, not a replacement', async () => {
    const { connection } = fakeConnection();
    const { wallet, signed } = fakeWallet();
    await run(
      signSendAndConfirm(connection, wallet, [ix()], { ...options, minComputeUnits: 400_000 })
    );
    assert.equal(budgetOf(signed[0])[0], 400_000, 'raised to the floor');
    await run(
      signSendAndConfirm(connection, wallet, [ix()], { ...options, minComputeUnits: 1_000 })
    );
    assert.equal(budgetOf(signed[1])[0], 36_600, 'measured size wins over a low floor');
  });

  test('the floor also applies when simulation could not measure', async () => {
    const { connection } = fakeConnection({
      simulation: () => {
        throw new Error('429 Too Many Requests');
      },
    });
    const { wallet, signed } = fakeWallet();
    await run(
      signSendAndConfirm(connection, wallet, [ix()], { ...options, minComputeUnits: 900_000 })
    );
    assert.equal(budgetOf(signed[0])[0], 900_000);
  });

  test('a stake-pool refresh failure is explained as transient', async () => {
    const { connection } = fakeConnection({
      simulation: {
        err: { InstructionError: [0, { Custom: 16 }] },
        logs: [
          'Program log: First update old validator stake account balances and then pool stake balance',
        ],
      },
    });
    const { wallet } = fakeWallet();
    const error = await rejects(signSendAndConfirm(connection, wallet, [ix()], options));
    assert.match(error.message, /Stake pool needs to be updated/);
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

describe('describeSendError', () => {
  test('rewrites the raw wallet and RPC strings a user would otherwise see', () => {
    assert.equal(
      describeSendError(new Error('WalletSignTransactionError: User rejected the request.')),
      'Transaction cancelled by user.'
    );
    assert.equal(
      describeSendError(new Error('failed to send transaction: Blockhash not found')),
      'Transaction expired. Please try again.'
    );
    assert.equal(
      describeSendError(new Error('Transfer: insufficient lamports 100, need 5000')),
      'Insufficient funds for transaction fees.'
    );
  });

  test('passes the pipeline errors through, since they already explain themselves', () => {
    const error = new SimulationFailedError({}, [
      'Program log: AnchorError occurred. Error Code: AlreadyApproved. Error Number: 6006. Error Message: Member already approved the transaction.',
    ]);
    assert.equal(describeSendError(error), error.message);
    assert.equal(describeSendError('plain string'), 'plain string');
  });
});

describe('wallet account mismatch', () => {
  beforeEach(() => mock.timers.enable({ apis: ['setTimeout', 'Date'] }));
  afterEach(() => mock.timers.reset());

  const clearText = /active account is not the connected account.*Connect again/i;
  const walletRefusing = (rejection: Error) => {
    const disconnects: number[] = [];
    const wallet: SigningWallet = {
      publicKey: keypair.publicKey,
      signTransaction: async () => {
        throw rejection;
      },
      disconnect: async () => {
        disconnects.push(Date.now());
      },
    };
    return { wallet, disconnects };
  };

  test('recognizes the wallet refusing to sign for a stale account', () => {
    assert.ok(isWalletAccountMismatch(new WalletSignTransactionError('invalid account')));
    assert.ok(isWalletAccountMismatch(new WalletSignTransactionError('Invalid Account')));
    assert.ok(
      isWalletAccountMismatch(
        new WalletSignTransactionError(undefined, new Error('invalid account'))
      )
    );
  });

  test('ignores other sign errors and look-alikes from elsewhere', () => {
    assert.ok(
      !isWalletAccountMismatch(new WalletSignTransactionError('User rejected the request.'))
    );
    assert.ok(!isWalletAccountMismatch(new Error('invalid account')));
    assert.ok(!isWalletAccountMismatch('invalid account'));
    assert.ok(!isWalletAccountMismatch(null));
  });

  test('describeSendError explains the raw wallet error', () => {
    assert.match(describeSendError(new WalletSignTransactionError('invalid account')), clearText);
  });

  test('the pipeline disconnects the stale wallet and explains why, and sends nothing', async () => {
    const { calls, connection } = fakeConnection();
    const { wallet, disconnects } = walletRefusing(
      new WalletSignTransactionError('invalid account')
    );
    const error = await rejects(signSendAndConfirm(connection, wallet, [ix()], options));
    assert.ok(error instanceof WalletAccountMismatchError, String(error));
    assert.ok(error.walletError instanceof WalletSignTransactionError);
    assert.equal(error.disconnected, true);
    assert.match(error.message, /the page disconnected it/);
    // ExecuteButton prefixes up to ~51 characters, and the toasts cut at 200.
    assert.ok(error.message.length <= 149, `${error.message.length} characters`);
    assert.equal(disconnects.length, 1);
    assert.equal(calls.sends, 0);
    // Every toast style in the app shows the clear text, never "invalid account".
    for (const shown of [`${error}`, formatError(error), describeSendError(error), error.message]) {
      assert.match(shown, clearText);
      assert.doesNotMatch(shown, /invalid account|WalletAccountMismatchError/);
    }
  });

  test('the v0 pipeline does the same', async () => {
    const { connection } = fakeConnection();
    const { wallet, disconnects } = walletRefusing(
      new WalletSignTransactionError('invalid account')
    );
    const error = await rejects(signSendAndConfirmV0(connection, wallet, [ix()], options));
    assert.ok(error instanceof WalletAccountMismatchError, String(error));
    assert.equal(disconnects.length, 1);
  });

  test('a failed disconnect still gives the clear text, and asks the user to disconnect', async () => {
    const { connection } = fakeConnection();
    const { wallet } = walletRefusing(new WalletSignTransactionError('invalid account'));
    wallet.disconnect = async () => {
      throw new Error('extension closed');
    };
    const error = await rejects(signSendAndConfirm(connection, wallet, [ix()], options));
    assert.ok(error instanceof WalletAccountMismatchError, String(error));
    assert.equal(error.disconnected, false);
    assert.match(`${error}`, /Disconnect and connect again/);
  });

  test('a disconnect that never settles does not hold back the error', async () => {
    const { connection } = fakeConnection();
    const { wallet } = walletRefusing(new WalletSignTransactionError('invalid account'));
    wallet.disconnect = () => new Promise(() => {});
    const error = await rejects(signSendAndConfirm(connection, wallet, [ix()], options));
    assert.ok(error instanceof WalletAccountMismatchError, String(error));
    assert.equal(error.disconnected, false);
    assert.match(`${error}`, /Disconnect and connect again/);
  });

  test('a wallet without disconnect gets the same clear text', async () => {
    const { connection } = fakeConnection();
    const { wallet } = walletRefusing(new WalletSignTransactionError('invalid account'));
    delete wallet.disconnect;
    const error = await rejects(signSendAndConfirm(connection, wallet, [ix()], options));
    assert.ok(error instanceof WalletAccountMismatchError, String(error));
    assert.equal(error.disconnected, false);
    assert.match(`${error}`, /Disconnect and connect again/);
  });

  test('a user rejection passes through unchanged and keeps the wallet connected', async () => {
    const { connection } = fakeConnection();
    const rejection = new WalletSignTransactionError('User rejected the request.');
    const { wallet, disconnects } = walletRefusing(rejection);
    const error = await rejects(signSendAndConfirm(connection, wallet, [ix()], options));
    assert.equal(error, rejection);
    assert.equal(describeSendError(error), 'Transaction cancelled by user.');
    assert.equal(disconnects.length, 0);
  });
});

describe('signSendAndConfirmV0', () => {
  beforeEach(() => mock.timers.enable({ apis: ['setTimeout', 'Date'] }));
  afterEach(() => mock.timers.reset());

  test('builds a v0 transaction with the same budget in front', async () => {
    const { connection } = fakeConnection();
    const { wallet, signed } = fakeWallet();
    const signature = await run(signSendAndConfirmV0(connection, wallet, [ix(), ix()], options));
    assert.ok(signed[0] instanceof VersionedTransaction);
    assert.equal(signature, signatureOf(signed[0]));
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

  test('a wallet that never answers is abandoned at the cap, not when the blockhash dies', async () => {
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
    assert.ok(Date.now() - start >= 180_000, `gave up after ${Date.now() - start}ms`);
    assert.equal(calls.sends, 0);
  });

  test('a wallet that answers late with the original blockhash is not sent', async () => {
    const start = Date.now();
    const { calls, connection } = fakeConnection({
      blockHeight: () => (Date.now() - start > 40_000 ? 1_000 : 900),
    });
    const { wallet } = fakeWallet();
    const slowSign = wallet.signTransaction!;
    wallet.signTransaction = (transaction) =>
      new Promise((resolve) => setTimeout(() => resolve(slowSign(transaction)), 90_000));
    const error = await rejects(signSendAndConfirm(connection, wallet, [ix()], { label: 't' }));
    assert.ok(error instanceof SignedAfterExpiryError, String(error));
    assert.match(error.message, /Nothing was sent/);
    assert.match(
      `${error}`,
      /^The transaction expired/,
      'toasts show the message without the class name'
    );
    assert.equal(calls.sends, 0);
  });

  test('a wallet that answers in time is sent normally', async () => {
    const { calls, connection } = fakeConnection({ blockHeight: () => 900 });
    const { wallet, signed } = fakeWallet();
    const quickSign = wallet.signTransaction!;
    wallet.signTransaction = (transaction) =>
      new Promise((resolve) => setTimeout(() => resolve(quickSign(transaction)), 14_000));
    const signature = await run(signSendAndConfirm(connection, wallet, [ix()], { label: 't' }));
    assert.equal(signature, signatureOf(signed[0]));
    assert.equal(calls.sends, 1);
  });
});

describe('wallet-refreshed blockhash', () => {
  beforeEach(() => mock.timers.enable({ apis: ['setTimeout', 'Date'] }));
  afterEach(() => mock.timers.reset());

  const REFRESHED = Keypair.generate().publicKey.toBase58();

  /**
   * A wallet that, like Ledger's provider, takes `delayMs` on the device and
   * then signs with a fresh blockhash in place of the app's.
   */
  function refreshingWallet(delayMs: number) {
    const signed: (Transaction | VersionedTransaction)[] = [];
    const wallet: SigningWallet = {
      publicKey: keypair.publicKey,
      signTransaction: (transaction) =>
        new Promise((resolve) =>
          setTimeout(() => {
            if (transaction instanceof VersionedTransaction) {
              transaction.message.recentBlockhash = REFRESHED;
              transaction.sign([keypair]);
            } else {
              transaction.recentBlockhash = REFRESHED;
              transaction.partialSign(keypair);
            }
            signed.push(transaction);
            resolve(transaction);
          }, delayMs)
        ),
    };
    return { wallet, signed };
  }

  /** Height passes the app's lastValidBlockHeight (999) after 40s, then holds at 1,050. */
  const expiresAt40s = (start: number) => () => (Date.now() - start > 40_000 ? 1_050 : 900);

  test('is sent after the app blockhash expired, and tracked past the old height', async () => {
    const start = Date.now();
    // Not confirmed until the 10th poll. Tracked against the app's height
    // (999), the send would have been called expired after the 8th.
    const { calls, connection } = fakeConnection({
      blockHeight: expiresAt40s(start),
      status: (poll) => (poll < 10 ? null : { err: null, confirmationStatus: 'confirmed' }),
    });
    const { wallet, signed } = refreshingWallet(60_000);
    const signature = await run(signSendAndConfirm(connection, wallet, [ix()], options));
    assert.equal(signature, signatureOf(signed[0]));
    assert.equal(Transaction.from(calls.sent[0]).recentBlockhash, REFRESHED);
  });

  test('works the same for a v0 transaction', async () => {
    const start = Date.now();
    const { calls, connection } = fakeConnection({ blockHeight: expiresAt40s(start) });
    const { wallet, signed } = refreshingWallet(60_000);
    const signature = await run(signSendAndConfirmV0(connection, wallet, [ix()], options));
    assert.equal(signature, signatureOf(signed[0]));
    assert.equal(
      VersionedTransaction.deserialize(calls.sent[0]).message.recentBlockhash,
      REFRESHED
    );
  });

  test('is refused when other keys already signed, since their signatures no longer match', async () => {
    const cosigner = Keypair.generate();
    const needsCosigner = new TransactionInstruction({
      keys: [{ pubkey: cosigner.publicKey, isSigner: true, isWritable: false }],
      programId: program,
      data: Buffer.alloc(8, 1),
    });
    const { calls, connection } = fakeConnection();
    const { wallet } = refreshingWallet(1_000);
    const error = await rejects(
      signSendAndConfirm(connection, wallet, [needsCosigner], { ...options, signers: [cosigner] })
    );
    assert.ok(error instanceof WalletChangedCoSignedTransactionError, String(error));
    assert.equal(calls.sends, 0);
  });

  test('a refreshed blockhash the RPC does not know points at the wallet network', async () => {
    const { connection } = fakeConnection({
      send: () => {
        throw new SendTransactionError({
          action: 'send',
          signature: '',
          transactionMessage: 'Transaction simulation failed: Blockhash not found',
        });
      },
    });
    const { wallet } = refreshingWallet(1_000);
    const error = await rejects(signSendAndConfirm(connection, wallet, [ix()], options));
    assert.ok(error instanceof WalletBlockhashUnknownError, String(error));
    assert.match(error.message, /same network/);
    assert.doesNotMatch(describeSendError(error), /expired/i);
  });

  test('the same rejection on the app blockhash still reads as expired', async () => {
    const { connection } = fakeConnection({
      send: () => {
        throw new SendTransactionError({
          action: 'send',
          signature: '',
          transactionMessage: 'Transaction simulation failed: Blockhash not found',
        });
      },
    });
    const { wallet } = fakeWallet();
    const error = await rejects(signSendAndConfirm(connection, wallet, [ix()], options));
    assert.ok(!(error instanceof WalletBlockhashUnknownError), String(error));
    assert.equal(describeSendError(error), 'Transaction expired. Please try again.');
  });
});

describe('sign again', () => {
  beforeEach(() => mock.timers.enable({ apis: ['setTimeout', 'Date'] }));
  afterEach(() => mock.timers.reset());

  /**
   * A chain where height is 900 + one block per 0.4s (X1's pace), and every
   * blockhash handed out lives 150 blocks from the height it was fetched at.
   */
  function movingChain() {
    const start = Date.now();
    const height = () => 900 + Math.floor((Date.now() - start) / 400);
    return fakeConnection({
      blockHeight: height,
      latest: () => ({
        blockhash: Keypair.generate().publicKey.toBase58(),
        lastValidBlockHeight: height() + 150,
      }),
    });
  }

  /** A wallet whose Nth signature takes `delaysMs[N]`, keeping the blockhash it was given. */
  function slowThenFastWallet(delaysMs: number[]) {
    const signed: (Transaction | VersionedTransaction)[] = [];
    const { wallet } = fakeWallet();
    const sign = wallet.signTransaction!;
    wallet.signTransaction = (transaction) => {
      const delay = delaysMs[Math.min(signed.length, delaysMs.length - 1)];
      signed.push(transaction);
      return new Promise((resolve) => setTimeout(() => resolve(sign(transaction)), delay));
    };
    return { wallet, signed };
  }

  /** An onStep that answers "sign again?" with the given answers, in order. */
  function stepsAnswering(...answers: boolean[]) {
    const asked: number[] = [];
    const onStep = Object.assign((_step: SendStep) => {}, {
      signAgain: async ({ signMs }: { signMs: number }) => {
        asked.push(signMs);
        return answers[asked.length - 1] ?? false;
      },
    });
    return { onStep, asked };
  }

  test('a late signature, then "Sign again", sends the fresh one once', async () => {
    const { calls, connection } = movingChain();
    const { wallet, signed } = slowThenFastWallet([90_000, 10_000]);
    const { onStep, asked } = stepsAnswering(true);
    const signature = await run(
      signSendAndConfirm(connection, wallet, [ix()], { ...options, onStep })
    );
    assert.equal(asked.length, 1);
    assert.ok(asked[0] >= 90_000, `asked after ${asked[0]}ms`);
    assert.equal(signed.length, 2, 'the wallet was asked twice');
    assert.notEqual(
      (signed[0] as Transaction).recentBlockhash,
      (signed[1] as Transaction).recentBlockhash,
      'the second try carries a fresh blockhash'
    );
    assert.equal(calls.sends, 1, 'only the second signature was sent');
    assert.equal(signature, signatureOf(signed[1]));
  });

  test('dismissing the prompt sends nothing and reports the expiry', async () => {
    const { calls, connection } = movingChain();
    const { wallet, signed } = slowThenFastWallet([90_000]);
    const { onStep, asked } = stepsAnswering(false);
    const error = await rejects(
      signSendAndConfirm(connection, wallet, [ix()], { ...options, onStep })
    );
    assert.ok(error instanceof SignedAfterExpiryError, String(error));
    assert.equal(asked.length, 1);
    assert.equal(signed.length, 1);
    assert.equal(calls.sends, 0);
  });

  test('stops offering after two retries', async () => {
    const { calls, connection } = movingChain();
    const { wallet, signed } = slowThenFastWallet([90_000]);
    const { onStep, asked } = stepsAnswering(true, true, true);
    const error = await rejects(
      signSendAndConfirm(connection, wallet, [ix()], { ...options, onStep })
    );
    assert.ok(error instanceof SignedAfterExpiryError, String(error));
    assert.equal(asked.length, 2);
    assert.equal(signed.length, 3);
    assert.equal(calls.sends, 0);
  });

  test('a plain onStep with no prompt fails as before', async () => {
    const { calls, connection } = movingChain();
    const { wallet } = slowThenFastWallet([90_000]);
    const steps: SendStep[] = [];
    const error = await rejects(
      signSendAndConfirm(connection, wallet, [ix()], {
        ...options,
        onStep: (step) => steps.push(step),
      })
    );
    assert.ok(error instanceof SignedAfterExpiryError, String(error));
    assert.deepEqual(steps, ['preparing', 'signing']);
    assert.equal(calls.sends, 0);
  });
});
