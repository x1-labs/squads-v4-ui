import {
  PACKET_DATA_SIZE,
  PublicKey,
  SendTransactionError,
  Transaction,
  TransactionMessage,
  VersionedTransaction,
} from '@solana/web3.js';
import type {
  AddressLookupTableAccount,
  Connection,
  Signer,
  SimulatedTransactionResponse,
  TransactionInstruction,
} from '@solana/web3.js';
import {
  computeBudgetInstructions,
  getPriorityFeeMicroLamports,
  runtimeDefaultComputeUnits,
  sizeComputeUnitLimit,
} from './priorityFee';
import { describeRpc, getSendableBlockhash, sendAndConfirm } from './sendAndConfirm';

/** The slice of a wallet-adapter wallet this needs: the sign-only flow, never `sendTransaction`. */
export type SigningWallet = {
  publicKey: PublicKey | null;
  signTransaction?: <T extends Transaction | VersionedTransaction>(transaction: T) => Promise<T>;
  /** Called when the wallet refuses to sign for `publicKey`, so the user connects again. */
  disconnect?: () => Promise<void>;
};

/** Where the pipeline is, for callers that show progress. */
export type SendStep = 'preparing' | 'signing' | 'confirming';

export type SignSendAndConfirmOptions = {
  /**
   * Accounts the priority fee is priced against. Defaults to every account the
   * instructions mark writable, which is the right answer for nearly everything.
   */
  writableAccounts?: PublicKey[];
  /**
   * `unitsConsumed` from the caller's own simulation, used to size the compute
   * limit. Leave undefined and the pipeline simulates to measure it, failing
   * before the wallet prompt if the transaction cannot succeed.
   */
  unitsConsumed?: number | null;
  /** Bypass the fee market with a price the user chose, in micro-lamports per CU. */
  priorityFeeMicroLamports?: number;
  /** Never request fewer compute units than this, whatever simulation measured. */
  minComputeUnits?: number;
  /** Prefix for console output, e.g. 'ApproveButton'. */
  label: string;
  /** Progress callback: 'signing' right before the wallet prompt, 'confirming' once signed. */
  onStep?: (step: SendStep) => void;
  /** Appended to the error when the transaction exceeds the packet size, e.g. 'Select fewer proposals.' */
  tooLargeHint?: string;
  /**
   * Keypairs that must sign besides the wallet, e.g. a freshly generated
   * account's key. They sign first; the wallet then adds its own signature to
   * the partially signed transaction.
   */
  signers?: Signer[];
};

export type SignSendAndConfirmV0Options = SignSendAndConfirmOptions & {
  lookupTables?: AddressLookupTableAccount[];
};

/** Thrown when the pre-sign simulation says the transaction would fail on chain. */
export class SimulationFailedError extends Error {
  constructor(
    public readonly err: unknown,
    public readonly logs: string[]
  ) {
    super(describeSimulation(err, logs));
    this.name = 'SimulationFailedError';
  }
}

function describeSimulation(err: unknown, logs: string[]): string {
  const anchor = logs
    .map((log) => /Error Code: (\w+)\. Error Number: \d+\. Error Message: (.+?)\.?$/.exec(log))
    .find(Boolean);
  if (anchor) return `${anchor[2]} (${anchor[1]})`;
  const text = logs.join('\n');
  // A vault execute that touches a stake pool fails until the pool's balances
  // are refreshed for the epoch; it is transient, not a broken proposal.
  if (text.includes('First update old validator stake account balances')) {
    return 'Stake pool needs to be updated. Please wait a moment and try again.';
  }
  if (/NotAuthorized|Not authorized/.test(text)) {
    return 'Not authorized to perform this action. You may not be a member of this multisig or lack the required permissions.';
  }
  const lastLog = [...logs].reverse().find((log) => /error|failed/i.test(log));
  return `Transaction simulation failed: ${lastLog ?? JSON.stringify(err)}`;
}

const WALLET_ACCOUNT_MISMATCH_MESSAGE =
  "Your wallet's active account is not the connected account. Nothing was sent. " +
  'Disconnect and connect again.';
const WALLET_ACCOUNT_MISMATCH_DISCONNECTED_MESSAGE =
  "Your wallet's active account is not the connected account, so the page disconnected it. " +
  'Nothing was sent. Connect again to use the active account.';

/**
 * True when the wallet refused to sign because its active account is not the
 * account the page connected. This occurs when the user switches accounts in
 * the extension and the extension does not announce the change. The match uses
 * the error name, not `instanceof`, so this module does not import the adapter.
 */
export function isWalletAccountMismatch(error: unknown): boolean {
  if (!(error instanceof Error) || error.name !== 'WalletSignTransactionError') return false;
  const cause = (error as { error?: unknown }).error;
  const causeMessage = cause instanceof Error ? cause.message : '';
  return /invalid account/i.test(error.message) || /invalid account/i.test(causeMessage);
}

/**
 * The wallet refused to sign for the connected account, because the user
 * switched accounts in the wallet. Nothing was sent. A reconnect fixes it.
 * `disconnected` tells if the pipeline already disconnected the wallet.
 */
export class WalletAccountMismatchError extends Error {
  constructor(
    public readonly walletError: unknown,
    public readonly disconnected: boolean
  ) {
    super(
      disconnected ? WALLET_ACCOUNT_MISMATCH_DISCONNECTED_MESSAGE : WALLET_ACCOUNT_MISMATCH_MESSAGE
    );
    this.name = 'WalletAccountMismatchError';
  }

  // Many toasts interpolate the error as `${e}`. Return only the message, so
  // the toast does not show the class name.
  toString(): string {
    return this.message;
  }
}

/**
 * User-facing text for anything the pipeline can throw. The pipeline's own
 * errors already explain themselves; this rewrites the raw ones — the wallet's
 * rejection and the RPC's terse strings — that would otherwise reach a toast.
 */
export function describeSendError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (isWalletAccountMismatch(error)) return WALLET_ACCOUNT_MISMATCH_MESSAGE;
  if (/User rejected|rejected the request/i.test(message)) return 'Transaction cancelled by user.';
  if (/blockhash not found/i.test(message)) return 'Transaction expired. Please try again.';
  if (/insufficient funds|insufficient lamports/i.test(message)) {
    return 'Insufficient funds for transaction fees.';
  }
  return message || 'Transaction failed';
}

/**
 * The send pipeline shared by every proposal action and batch:
 *
 *   1. price a priority fee from the fee market for `writableAccounts`;
 *   2. simulate to measure compute, unless the caller already did;
 *   3. fetch a fresh blockhash, build the final transaction with the budget
 *      instructions in front, and check it fits in a packet;
 *   4. have the wallet sign, accepting a blockhash the wallet refreshed; then
 *   5. broadcast and rebroadcast until the signature confirms or the blockhash expires.
 *
 * Resolves with the signature. Throws `SimulationFailedError` before the wallet
 * prompt, `TransactionFailedError` / `TransactionExpiredError` /
 * `TransactionStatusUnknownError` from `sendAndConfirm`, `WalletAccountMismatchError`
 * if the wallet's active account is not the connected one, one of the
 * `WalletSignatureTimeoutError` / `SignedAfterExpiryError` /
 * `WalletChangedCoSignedTransactionError` / `WalletBlockhashUnknownError`
 * family when what the wallet returned cannot be sent, or the wallet's own
 * error if the user declines to sign.
 */
export async function signSendAndConfirm(
  connection: Connection,
  wallet: SigningWallet,
  instructions: TransactionInstruction[],
  options: SignSendAndConfirmOptions
): Promise<string> {
  return pipeline(connection, wallet, instructions, options, {
    build: (payer, budget, blockhash) => {
      const transaction = new Transaction();
      transaction.feePayer = payer;
      transaction.recentBlockhash = blockhash;
      transaction.add(...budget, ...instructions);
      return transaction;
    },
    // web3.js copies the transaction and stamps its own blockhash on the copy,
    // so the probe's placeholder blockhash never reaches the RPC.
    simulate: async (probe) => (await connection.simulateTransaction(probe)).value,
    size: (transaction) => {
      // Both message encoders write into a packet-sized buffer and throw on
      // overrun, so an oversize transaction has no measurable size.
      try {
        const message = transaction.compileMessage();
        return 1 + 64 * message.header.numRequiredSignatures + message.serialize().length;
      } catch {
        return null;
      }
    },
  });
}

/** `signSendAndConfirm` for a v0 transaction, which is what lookup tables require. */
export async function signSendAndConfirmV0(
  connection: Connection,
  wallet: SigningWallet,
  instructions: TransactionInstruction[],
  options: SignSendAndConfirmV0Options
): Promise<string> {
  return pipeline(connection, wallet, instructions, options, {
    build: (payer, budget, blockhash) =>
      new VersionedTransaction(
        new TransactionMessage({
          payerKey: payer,
          recentBlockhash: blockhash,
          instructions: [...budget, ...instructions],
        }).compileToV0Message(options.lookupTables)
      ),
    simulate: async (probe) =>
      (
        await connection.simulateTransaction(probe, {
          sigVerify: false,
          replaceRecentBlockhash: true,
        })
      ).value,
    size: ({ message }) => {
      try {
        return 1 + 64 * message.header.numRequiredSignatures + message.serialize().length;
      } catch {
        return null;
      }
    },
  });
}

/** How each transaction format is built, simulated and measured; the pipeline is otherwise identical. */
type Shape<T extends Transaction | VersionedTransaction> = {
  build: (payer: PublicKey, budget: TransactionInstruction[], blockhash: string) => T;
  simulate: (probe: T) => Promise<SimulatedTransactionResponse>;
  /** Wire size in bytes, or null if it cannot even be encoded (i.e. oversize). */
  size: (transaction: T) => number | null;
};

/** How often to check on a wallet that has not returned a signature yet. */
const SIGN_WATCHDOG_INTERVAL_MS = 5_000;
/** Log a "still waiting" line this often, so a stuck prompt is visible in the console. */
const SIGN_WATCHDOG_LOG_EVERY = 3;
/**
 * Give up on a wallet that has not answered after this long. Deliberately not
 * tied to the blockhash: a wallet that refreshes it after the user approves
 * returns a sendable transaction however long the review took.
 */
const SIGN_MAX_WAIT_MS = 180_000;
/** Stop waiting for the wallet to disconnect after this long, so the error still shows. */
const DISCONNECT_MAX_WAIT_MS = 3_000;
/**
 * How long a blockhash the wallet put in is assumed to live, in blocks past the
 * height when the wallet returned it. 150 is the protocol limit; the margin
 * covers a wallet RPC a few blocks ahead of ours. Too high only delays an
 * "expired" verdict, because the status poll still reports a landing at once.
 */
const REFRESHED_BLOCKHASH_LIFETIME_BLOCKS = 150 + 20;
/**
 * Most blocks that can pass per millisecond: one per 200ms slot, Solana's
 * fastest. Only used to bound a refreshed blockhash's life when the RPC will
 * not tell us the current height.
 */
const MAX_BLOCKS_PER_MS = 1 / 200;

/**
 * An error whose message already reads as a sentence for the user. Many
 * toasts interpolate the error as `${e}`, so `toString` returns only the
 * message, not the class name in front of it.
 */
class UserFacingError extends Error {
  toString(): string {
    return this.message;
  }
}

/** The wallet never returned a signature. Nothing was sent, so retrying is safe. */
export class WalletSignatureTimeoutError extends UserFacingError {
  constructor(public readonly waitedMs: number) {
    super(
      `The wallet did not return a signature within ${Math.round(waitedMs / 1000)}s. ` +
        'Nothing was sent. Check the wallet (and hardware device, if any) and try again.'
    );
    this.name = 'WalletSignatureTimeoutError';
  }
}

/**
 * The wallet signed, but only after the blockhash it signed had died, so the
 * transaction could never land. Nothing was sent, so retrying is safe.
 */
export class SignedAfterExpiryError extends UserFacingError {
  constructor(public readonly signMs: number) {
    super(
      `The transaction expired while it waited in the wallet (approved after ` +
        `${Math.round(signMs / 1000)}s). Nothing was sent. Try again and approve it sooner.`
    );
    this.name = 'SignedAfterExpiryError';
  }
}

/**
 * The wallet put in a new blockhash on a transaction that other keys had
 * already signed, which invalidates their signatures. Nothing was sent.
 */
export class WalletChangedCoSignedTransactionError extends UserFacingError {
  constructor() {
    super(
      "Your wallet replaced the transaction's blockhash, which invalidates the other " +
        'signatures it needs. Nothing was sent. Try again.'
    );
    this.name = 'WalletChangedCoSignedTransactionError';
  }
}

/**
 * The wallet put in a blockhash that the app's RPC has never seen, so it was
 * rejected before sending. Usually the wallet is on a different network.
 */
export class WalletBlockhashUnknownError extends UserFacingError {
  constructor(
    public readonly blockhash: string,
    rpc: string
  ) {
    super(
      `Your wallet replaced the transaction's blockhash with one that ${rpc} does not ` +
        'recognize. Nothing was sent. Check that the wallet is set to the same network ' +
        'as this app, then try again.'
    );
    this.name = 'WalletBlockhashUnknownError';
  }
}

/** The blockhash a transaction carries, whichever format it is. */
function blockhashOf(transaction: Transaction | VersionedTransaction): string | null {
  return transaction instanceof VersionedTransaction
    ? transaction.message.recentBlockhash
    : (transaction.recentBlockhash ?? null);
}

/**
 * `wallet.signTransaction`, with a watchdog.
 *
 * A wallet prompt that never settles (extension hung, hardware device asleep,
 * popup dismissed without a rejection event) otherwise leaves the caller
 * awaiting forever with nothing in the console. So while the wallet has the
 * transaction, the block height is checked every few seconds and logged, and
 * after `SIGN_MAX_WAIT_MS` the wait is abandoned.
 *
 * The wait is not cut off when the app's blockhash dies. Some wallets (Ledger's
 * own provider, for one) show the transaction on the device and then fetch a
 * fresh blockhash once the user approves, so review time does not count
 * against the ~150-block window. Abandoning at expiry would throw away exactly
 * those transactions. What came back is checked after signing instead.
 */
async function awaitWalletSignature<T extends Transaction | VersionedTransaction>(
  connection: Connection,
  sign: () => Promise<T>,
  lastValidBlockHeight: number,
  tag: string
): Promise<T> {
  const startedAt = Date.now();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let abandoned = false;

  const watchdog = new Promise<never>((_, reject) => {
    let ticks = 0;
    let loggedExpiry = false;
    const check = async () => {
      ticks += 1;
      const waitedMs = Date.now() - startedAt;
      if (waitedMs > SIGN_MAX_WAIT_MS) {
        abandoned = true;
        console.error(`${tag} Gave up waiting for the wallet after ${waitedMs}ms`);
        reject(new WalletSignatureTimeoutError(waitedMs));
        return;
      }

      let blockHeight: number | null = null;
      try {
        blockHeight = await connection.getBlockHeight('confirmed');
      } catch (error) {
        console.warn(`${tag} Block height lookup failed while waiting for the wallet:`, error);
      }
      if (abandoned) return;

      const waited = `${Math.round(waitedMs / 1000)}s`;
      if (blockHeight !== null && blockHeight > lastValidBlockHeight) {
        if (!loggedExpiry) {
          loggedExpiry = true;
          console.warn(
            `${tag} The app's blockhash expired after ${waited} in the wallet. Still waiting: ` +
              'a wallet that refreshes the blockhash on approval can still return a sendable ' +
              'transaction.',
            { blockHeight, lastValidBlockHeight }
          );
        }
      } else if (ticks % SIGN_WATCHDOG_LOG_EVERY === 0) {
        const left = blockHeight !== null ? `${lastValidBlockHeight - blockHeight}` : 'unknown';
        console.warn(
          `${tag} Still waiting for the wallet after ${waited}, ${left} blocks of validity left`
        );
      }
      timer = setTimeout(check, SIGN_WATCHDOG_INTERVAL_MS);
    };
    timer = setTimeout(check, SIGN_WATCHDOG_INTERVAL_MS);
  });

  try {
    return await Promise.race([sign(), watchdog]);
  } finally {
    abandoned = true;
    clearTimeout(timer);
  }
}

/**
 * The `lastValidBlockHeight` to track a signed transaction against.
 *
 * If the wallet kept the app's blockhash, that is the one that came with it,
 * and a transaction already past it is not sent. If the wallet put in its own,
 * nothing says when that one dies, so it is bounded from above. Ledger's
 * guidance is the same: do not confirm a refreshed transaction against the
 * original blockhash's height.
 */
async function lifetimeOfSigned(
  connection: Connection,
  signed: Transaction | VersionedTransaction,
  built: { blockhash: string; lastValidBlockHeight: number },
  signMs: number,
  hasCoSigners: boolean,
  tag: string
): Promise<{ lastValidBlockHeight: number; walletRefreshedBlockhash: boolean }> {
  const signedBlockhash = blockhashOf(signed);
  const walletRefreshedBlockhash = signedBlockhash !== built.blockhash;
  console.log(`${tag} Signed in ${signMs}ms`, { walletRefreshedBlockhash, signedBlockhash });

  let blockHeight: number | null = null;
  try {
    blockHeight = await connection.getBlockHeight('confirmed');
  } catch (error) {
    console.warn(`${tag} Block height lookup failed after signing:`, error);
  }

  if (!walletRefreshedBlockhash) {
    // A lookup that failed, or a lagging node, just lets the send go ahead;
    // preflight then rejects a dead blockhash with "Blockhash not found".
    if (blockHeight !== null && blockHeight > built.lastValidBlockHeight) {
      console.error(`${tag} The wallet signed after the blockhash expired; not sending`, {
        blockHeight,
        lastValidBlockHeight: built.lastValidBlockHeight,
      });
      throw new SignedAfterExpiryError(signMs);
    }
    return { lastValidBlockHeight: built.lastValidBlockHeight, walletRefreshedBlockhash };
  }

  if (hasCoSigners) {
    console.error(`${tag} The wallet replaced the blockhash on a co-signed transaction`);
    throw new WalletChangedCoSignedTransactionError();
  }
  const lastValidBlockHeight =
    blockHeight !== null
      ? blockHeight + REFRESHED_BLOCKHASH_LIFETIME_BLOCKS
      : built.lastValidBlockHeight +
        Math.ceil(signMs * MAX_BLOCKS_PER_MS) +
        REFRESHED_BLOCKHASH_LIFETIME_BLOCKS;
  console.log(`${tag} The wallet refreshed the blockhash; tracking expiry against an estimate`, {
    builtBlockhash: built.blockhash,
    signedBlockhash,
    lastValidBlockHeight,
  });
  return { lastValidBlockHeight, walletRefreshedBlockhash };
}

/** Every account the instructions write to, deduplicated. */
function writableAccountsOf(instructions: TransactionInstruction[]): PublicKey[] {
  const seen = new Map<string, PublicKey>();
  for (const instruction of instructions) {
    for (const meta of instruction.keys) {
      if (meta.isWritable) seen.set(meta.pubkey.toBase58(), meta.pubkey);
    }
  }
  return [...seen.values()];
}

/** Any well-formed blockhash will do for a probe that simulation replaces anyway. */
const PLACEHOLDER_BLOCKHASH = PublicKey.default.toBase58();

async function pipeline<T extends Transaction | VersionedTransaction>(
  connection: Connection,
  wallet: SigningWallet,
  instructions: TransactionInstruction[],
  options: SignSendAndConfirmOptions,
  shape: Shape<T>
): Promise<string> {
  const tag = `[${options.label}]`;

  if (!wallet.publicKey) throw new Error('Wallet not connected');
  if (!wallet.signTransaction) throw new Error('Wallet does not support transaction signing');
  const payer = wallet.publicKey;

  options.onStep?.('preparing');

  // Price the transaction against what recently landed on the accounts it
  // writes to, unless the user set a price.
  const microLamports =
    options.priorityFeeMicroLamports ??
    (await getPriorityFeeMicroLamports(
      connection,
      options.writableAccounts ?? writableAccountsOf(instructions)
    ));

  // Size the compute limit to what simulation measured. The probe requests the
  // runtime's default budget so it is limited exactly the way the unbudgeted
  // transaction would have been.
  const defaultUnits = runtimeDefaultComputeUnits(instructions.length);
  let unitsConsumed = options.unitsConsumed;
  if (unitsConsumed === undefined) {
    const probe = shape.build(
      payer,
      computeBudgetInstructions({ units: defaultUnits, microLamports }),
      PLACEHOLDER_BLOCKHASH
    );
    try {
      const simulation = await shape.simulate(probe);
      if (simulation.err) {
        console.error(`${tag} Simulation failed:`, simulation.err, simulation.logs);
        throw new SimulationFailedError(simulation.err, simulation.logs ?? []);
      }
      unitsConsumed = simulation.unitsConsumed ?? null;
    } catch (error) {
      if (error instanceof SimulationFailedError) throw error;
      // The lookup broke, not the transaction. Preflight on send still guards
      // against a transaction that cannot succeed.
      console.warn(`${tag} Could not simulate to size compute; using runtime default:`, error);
      unitsConsumed = null;
    }
  }
  const minUnits = options.minComputeUnits ?? 0;
  const units = unitsConsumed
    ? sizeComputeUnitLimit(unitsConsumed, minUnits)
    : Math.max(minUnits, defaultUnits);

  // Fresh blockhash right before signing, so as little of the validity window
  // as possible is spent before the wallet prompts. 'confirmed' avoids handing
  // over one that is already ~31 blocks old.
  const { blockhash, lastValidBlockHeight } = await getSendableBlockhash(connection);

  // Budget instructions first — a compute budget applies to the whole
  // transaction regardless of position, but keeping them at the front matches
  // convention and keeps the decoded instruction list readable.
  const transaction = shape.build(
    payer,
    computeBudgetInstructions({ units, microLamports }),
    blockhash
  );

  // Checked after the budget instructions are in, since they count too. Better
  // a clear error here than a cryptic one from the wallet.
  const sizeBytes = shape.size(transaction);
  if (sizeBytes === null || sizeBytes > PACKET_DATA_SIZE) {
    const measured =
      sizeBytes === null
        ? `over ${PACKET_DATA_SIZE} bytes`
        : `${sizeBytes} bytes, limit ${PACKET_DATA_SIZE}`;
    throw new Error(`Transaction too large (${measured}). ${options.tooLargeHint ?? ''}`.trim());
  }

  // Everything that decides whether this lands, in one line for bug reports.
  console.log(`${tag} Send plan`, {
    rpc: describeRpc(connection.rpcEndpoint),
    instructions: instructions.length,
    sizeBytes,
    unitsConsumed,
    computeUnitLimit: units,
    priorityFeeMicroLamportsPerCu: microLamports,
    maxPriorityFeeLamports: Math.ceil((units * microLamports) / 1_000_000),
    blockhash,
    lastValidBlockHeight,
  });

  // Local keypairs sign before the wallet, so the wallet is handed a transaction
  // that needs only its own signature.
  if (options.signers?.length) {
    if (transaction instanceof VersionedTransaction) transaction.sign(options.signers);
    else transaction.partialSign(...options.signers);
  }

  // Sign only, then broadcast via the app's connection. The wallet never sends,
  // so it doesn't need to be pointed at this network's RPC — the app always
  // submits to the configured endpoint. This also avoids the "Plugin Closed"
  // errors some wallets throw on send.
  options.onStep?.('signing');
  const startSign = Date.now();
  let signedTransaction: T;
  try {
    signedTransaction = await awaitWalletSignature(
      connection,
      () => wallet.signTransaction!(transaction),
      lastValidBlockHeight,
      tag
    );
  } catch (error) {
    if (!isWalletAccountMismatch(error)) throw error;
    console.error(
      `${tag} The wallet refused to sign for ${payer.toBase58()}. Its active account is different.`,
      error
    );
    // The page cannot follow the switch, because the wallet did not announce it.
    // Disconnect, so the next connect reads the wallet's active account. This is
    // the same call as the Disconnect button.
    let disconnected = false;
    if (wallet.disconnect) {
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        disconnected = await Promise.race([
          wallet.disconnect().then(() => true),
          new Promise<false>((resolve) => {
            timer = setTimeout(() => resolve(false), DISCONNECT_MAX_WAIT_MS);
          }),
        ]);
        if (!disconnected) console.warn(`${tag} The wallet did not disconnect in time`);
      } catch (disconnectError) {
        console.warn(`${tag} Could not disconnect the wallet:`, disconnectError);
      } finally {
        clearTimeout(timer);
      }
    }
    throw new WalletAccountMismatchError(error, disconnected);
  }
  const signed = await lifetimeOfSigned(
    connection,
    signedTransaction,
    { blockhash, lastValidBlockHeight },
    Date.now() - startSign,
    !!options.signers?.length,
    tag
  );
  options.onStep?.('confirming');

  try {
    return await sendAndConfirm(connection, signedTransaction, signed.lastValidBlockHeight, {
      label: options.label,
    });
  } catch (error) {
    // Our own blockhash is one the RPC just handed out, so "not found" on a
    // refreshed one points at the wallet: most often a different network.
    if (
      signed.walletRefreshedBlockhash &&
      error instanceof SendTransactionError &&
      /blockhash not found/i.test(error.message)
    ) {
      throw new WalletBlockhashUnknownError(
        blockhashOf(signedTransaction) ?? '',
        describeRpc(connection.rpcEndpoint)
      );
    }
    throw error;
  }
}
