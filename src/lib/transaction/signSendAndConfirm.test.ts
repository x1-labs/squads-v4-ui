import { afterEach, beforeEach, describe, mock, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ComputeBudgetInstruction,
  Keypair,
  NONCE_ACCOUNT_LENGTH,
  PublicKey,
  SystemInstruction,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  VersionedTransaction,
} from '@solana/web3.js';
import type { Connection } from '@solana/web3.js';
import { WalletSignTransactionError } from '@solana/wallet-adapter-base';
import {
  SimulationFailedError,
  WalletAccountMismatchError,
  WalletSignatureTimeoutError,
  describeSendError,
  isWalletAccountMismatch,
  signSendAndConfirm,
  signSendAndConfirmV0,
} from './signSendAndConfirm.ts';
import type { SendStep, SigningWallet } from './signSendAndConfirm.ts';
import { formatError } from '../utils/errorHandler.ts';
import { forgetSpentNonces, nonceAccountAddress } from './durableNonce.ts';
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
  /** The wallet's nonce account value per read, or null for no nonce account. */
  nonce = (() => null) as () => string | null,
} = {}) {
  const calls = { simulations: 0, sends: 0, blockhashes: 0, probes: [] as unknown[] };
  const connection = {
    rpcEndpoint: 'http://rpc.test',
    getRecentPrioritizationFees: async () =>
      fees.map((prioritizationFee) => ({ prioritizationFee })),
    simulateTransaction: async (probe: unknown) => {
      calls.simulations += 1;
      calls.probes.push(probe);
      const value = typeof simulation === 'function' ? simulation() : simulation;
      return { value };
    },
    getLatestBlockhash: async () => {
      calls.blockhashes += 1;
      return { blockhash: PublicKey.default.toBase58(), lastValidBlockHeight: 999 };
    },
    getAccountInfo: async () => {
      const value = nonce();
      return value === null ? null : nonceAccountInfo(value, keypair.publicKey);
    },
    getAccountInfoAndContext: async () => {
      const value = nonce();
      return {
        context: { slot: 4242 },
        value: value === null ? null : nonceAccountInfo(value, keypair.publicKey),
      };
    },
    sendRawTransaction: async () => {
      calls.sends += 1;
      return 'SIGabc';
    },
    getSignatureStatuses: async () => ({ value: [{ err: null, confirmationStatus: 'confirmed' }] }),
    getBlockHeight: async () => blockHeight(),
  };
  return { calls, connection: connection as unknown as Connection };
}

const NONCE_A = bs58.encode(Buffer.alloc(32, 1));
const NONCE_B = bs58.encode(Buffer.alloc(32, 2));

/** An initialized system-program nonce account holding `nonce`, controlled by `authority`. */
function nonceAccountInfo(nonce: string, authority: PublicKey) {
  const data = Buffer.alloc(NONCE_ACCOUNT_LENGTH);
  data.writeUInt32LE(1, 0); // version: current
  data.writeUInt32LE(1, 4); // state: initialized
  authority.toBuffer().copy(data, 8);
  Buffer.from(bs58.decode(nonce)).copy(data, 40);
  return { data, owner: SystemProgram.programId, lamports: 1_447_680, executable: false };
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
    assert.match(error.message, /durable nonce signing in Settings/, 'points at the fix');
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
    const { wallet, signed } = fakeWallet();
    const quickSign = wallet.signTransaction!;
    wallet.signTransaction = (transaction) =>
      new Promise((resolve) => setTimeout(() => resolve(quickSign(transaction)), 14_000));
    const signature = await run(signSendAndConfirm(connection, wallet, [ix()], { label: 't' }));
    assert.equal(signature, signatureOf(signed[0]));
    assert.equal(calls.sends, 1);
  });
});

/**
 * Instruction data size that fits a legacy transaction with a blockhash
 * (1222 bytes) but not with the nonce advance's 106 extra bytes (1328).
 */
const FITS_ONLY_WITHOUT_NONCE = 1_000;

describe('durable nonce', () => {
  beforeEach(() => {
    forgetSpentNonces();
    mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  });
  afterEach(() => mock.timers.reset());

  /** A nonce source that answers `values` in order, repeating the last. */
  const sequence = (...values: string[]) => {
    let reads = 0;
    return () => values[Math.min(reads++, values.length - 1)];
  };

  test('back-to-back sends never re-sign a nonce a lagging node still reports', async () => {
    // Read 1 serves send 1. Read 2 comes from a node that has not seen send 1
    // land and still says NONCE_A; read 3 has caught up.
    const { connection } = fakeConnection({ nonce: sequence(NONCE_A, NONCE_A, NONCE_B) });
    const { wallet, signed } = fakeWallet();
    await run(signSendAndConfirm(connection, wallet, [ix()], options));
    await run(signSendAndConfirm(connection, wallet, [ix()], options));
    assert.equal((signed[0] as Transaction).recentBlockhash, NONCE_A);
    assert.equal((signed[1] as Transaction).recentBlockhash, NONCE_B);
  });

  test('a node that never catches up costs the nonce, not the send: it falls back to a blockhash', async () => {
    const { connection, calls } = fakeConnection({ nonce: () => NONCE_A });
    const { wallet, signed } = fakeWallet();
    await run(signSendAndConfirm(connection, wallet, [ix()], options));
    await run(signSendAndConfirm(connection, wallet, [ix()], options));
    assert.equal((signed[0] as Transaction).recentBlockhash, NONCE_A);
    assert.equal((signed[1] as Transaction).recentBlockhash, PublicKey.default.toBase58());
    assert.equal(calls.blockhashes, 1);
  });

  /** Decode the instruction a legacy transaction starts with as a nonce advance. */
  const advanceOf = (instruction: TransactionInstruction) => {
    assert.ok(instruction.programId.equals(SystemProgram.programId));
    assert.equal(SystemInstruction.decodeInstructionType(instruction), 'AdvanceNonceAccount');
    return SystemInstruction.decodeNonceAdvance(instruction);
  };

  test('signs against the nonce, with its advance first and no blockhash fetched', async () => {
    const { connection, calls } = fakeConnection({ nonce: () => NONCE_A });
    const { wallet, signed } = fakeWallet();
    const signature = await run(signSendAndConfirm(connection, wallet, [ix()], options));
    const transaction = signed[0] as Transaction;
    assert.equal(signature, signatureOf(transaction));
    assert.equal(transaction.recentBlockhash, NONCE_A);
    const advance = advanceOf(transaction.instructions[0]);
    assert.ok(advance.noncePubkey.equals(await nonceAccountAddress(keypair.publicKey)));
    assert.ok(advance.authorizedPubkey.equals(keypair.publicKey));
    assert.equal(
      ComputeBudgetInstruction.decodeInstructionType(transaction.instructions[1]),
      'SetComputeUnitLimit',
      'the budget follows the advance'
    );
    assert.equal(transaction.instructions.length, 4);
    assert.equal(calls.blockhashes, 0);
    // The simulation that sized compute included the advance too.
    advanceOf((calls.probes[0] as Transaction).instructions[0]);
  });

  test('v0: the advance is the first compiled instruction and the nonce is the blockhash', async () => {
    const { connection, calls } = fakeConnection({ nonce: () => NONCE_A });
    const { wallet, signed } = fakeWallet();
    await run(signSendAndConfirmV0(connection, wallet, [ix()], options));
    const { message } = signed[0] as VersionedTransaction;
    assert.equal(message.recentBlockhash, NONCE_A);
    const first = message.compiledInstructions[0];
    assert.ok(message.staticAccountKeys[first.programIdIndex].equals(SystemProgram.programId));
    assert.equal(Buffer.from(first.data).readUInt32LE(0), 4, 'AdvanceNonceAccount');
    assert.equal(calls.blockhashes, 0);
  });

  test('a slow wallet is waited for long past a blockhash window', async () => {
    // Block height is far past any blockhash limit; the nonce has not moved.
    const { calls, connection } = fakeConnection({
      nonce: () => NONCE_A,
      blockHeight: () => 1_000_000,
    });
    const { wallet, signed } = fakeWallet();
    const slowSign = wallet.signTransaction!;
    wallet.signTransaction = (transaction) =>
      new Promise((resolve) => setTimeout(() => resolve(slowSign(transaction)), 90_000));
    const signature = await run(signSendAndConfirm(connection, wallet, [ix()], { label: 't' }));
    assert.equal(signature, signatureOf(signed[0]));
    assert.equal(calls.sends, 1);
  });

  test('a nonce used elsewhere while the wallet is open abandons the wait, and nothing is sent', async () => {
    const start = Date.now();
    const { calls, connection } = fakeConnection({
      nonce: () => (Date.now() - start > 20_000 ? NONCE_B : NONCE_A),
    });
    const wallet: SigningWallet = {
      publicKey: keypair.publicKey,
      signTransaction: () => new Promise(() => {}),
    };
    const error = await rejects(signSendAndConfirm(connection, wallet, [ix()], { label: 't' }));
    assert.ok(error instanceof WalletSignatureTimeoutError, String(error));
    assert.equal((error as WalletSignatureTimeoutError).reason, 'nonce-used');
    assert.equal(calls.sends, 0);
  });

  test('a wallet that never answers is still abandoned eventually', async () => {
    const { calls, connection } = fakeConnection({ nonce: () => NONCE_A });
    const wallet: SigningWallet = {
      publicKey: keypair.publicKey,
      signTransaction: () => new Promise(() => {}),
    };
    const error = await rejects(signSendAndConfirm(connection, wallet, [ix()], { label: 't' }));
    assert.ok(error instanceof WalletSignatureTimeoutError, String(error));
    assert.equal((error as WalletSignatureTimeoutError).reason, 'too-long');
    assert.equal(calls.sends, 0);
  });

  test('useDurableNonce: false signs with a blockhash even when a nonce exists', async () => {
    const { connection, calls } = fakeConnection({ nonce: () => NONCE_A });
    const { wallet, signed } = fakeWallet();
    await run(
      signSendAndConfirm(connection, wallet, [ix()], { ...options, useDurableNonce: false })
    );
    assert.equal((signed[0] as Transaction).recentBlockhash, PublicKey.default.toBase58());
    assert.equal(calls.blockhashes, 1);
  });

  test('falls back to a blockhash when only the nonce advance pushes it over the packet limit', async () => {
    const { connection, calls } = fakeConnection({ nonce: () => NONCE_A });
    const { wallet, signed } = fakeWallet();
    await run(signSendAndConfirm(connection, wallet, [ix(FITS_ONLY_WITHOUT_NONCE)], options));
    const transaction = signed[0] as Transaction;
    assert.equal(transaction.recentBlockhash, PublicKey.default.toBase58());
    assert.equal(transaction.instructions.length, 3, 'no advance');
    assert.equal(calls.blockhashes, 1);
  });

  test('a caller-measured budget gets room for the advance', async () => {
    const { connection } = fakeConnection({ nonce: () => NONCE_A });
    const { wallet, signed } = fakeWallet();
    await run(
      signSendAndConfirm(connection, wallet, [ix()], { ...options, unitsConsumed: 30_000 })
    );
    const transaction = signed[0] as Transaction;
    const { units } = ComputeBudgetInstruction.decodeSetComputeUnitLimit(
      transaction.instructions[1]
    );
    // (30_000 + 300) * 1.2 + 600, against 36_600 without a nonce.
    assert.equal(units, 36_960);
  });

  test('an account at the nonce address with another authority is ignored', async () => {
    const { connection, calls } = fakeConnection();
    (connection as unknown as { getAccountInfoAndContext: unknown }).getAccountInfoAndContext =
      async () => ({
        context: { slot: 1 },
        value: nonceAccountInfo(NONCE_A, Keypair.generate().publicKey),
      });
    const { wallet, signed } = fakeWallet();
    await run(signSendAndConfirm(connection, wallet, [ix()], options));
    assert.equal((signed[0] as Transaction).recentBlockhash, PublicKey.default.toBase58());
    assert.equal(calls.blockhashes, 1);
  });
});
