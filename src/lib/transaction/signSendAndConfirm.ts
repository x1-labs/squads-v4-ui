import {
  PACKET_DATA_SIZE,
  PublicKey,
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
import {
  currentNonce,
  describeLifetime,
  describeRpc,
  getSendableBlockhash,
  sendAndConfirm,
} from './sendAndConfirm';
import type { TransactionLifetime } from './sendAndConfirm';
import { advanceNonceInstruction, fetchDurableNonce, markNonceSpent } from './durableNonce';
import type { DurableNonce } from './durableNonce';

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
  /**
   * Sign against the wallet's durable nonce account when it has one, so the
   * transaction does not expire while the wallet is open. Default true; only
   * transactions that manage the nonce account itself must turn it off.
   */
  useDurableNonce?: boolean;
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
 *   3. pick the lifetime — the wallet's durable nonce if it has one (see
 *      `durableNonce.ts`), else a fresh blockhash — build the final transaction
 *      with the nonce advance and budget instructions in front, and check it
 *      fits in a packet;
 *   4. have the wallet sign; then
 *   5. broadcast and rebroadcast until the signature confirms or its lifetime ends.
 *
 * Resolves with the signature. Throws `SimulationFailedError` before the wallet
 * prompt, `TransactionFailedError` / `TransactionExpiredError` /
 * `TransactionStatusUnknownError` from `sendAndConfirm`, `WalletAccountMismatchError`
 * if the wallet's active account is not the connected one, or the wallet's own
 * error if the user declines to sign.
 */
export async function signSendAndConfirm(
  connection: Connection,
  wallet: SigningWallet,
  instructions: TransactionInstruction[],
  options: SignSendAndConfirmOptions
): Promise<string> {
  return pipeline(connection, wallet, instructions, options, {
    build: (payer, leading, blockhash) => {
      const transaction = new Transaction();
      transaction.feePayer = payer;
      transaction.recentBlockhash = blockhash;
      transaction.add(...leading, ...instructions);
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
    build: (payer, leading, blockhash) =>
      new VersionedTransaction(
        new TransactionMessage({
          payerKey: payer,
          recentBlockhash: blockhash,
          instructions: [...leading, ...instructions],
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
  /**
   * `leading` goes before the caller's instructions: the nonce advance (which
   * the runtime requires to be first) and the compute budget. `blockhash` is
   * the recent blockhash, or the nonce value for a durable-nonce transaction.
   */
  build: (payer: PublicKey, leading: TransactionInstruction[], blockhash: string) => T;
  simulate: (probe: T) => Promise<SimulatedTransactionResponse>;
  /** Wire size in bytes, or null if it cannot even be encoded (i.e. oversize). */
  size: (transaction: T) => number | null;
};

/** How often to check on a wallet that has not returned a signature yet. */
const SIGN_WATCHDOG_INTERVAL_MS = 5_000;
/** Log a "still waiting" line this often, so a stuck prompt is visible in the console. */
const SIGN_WATCHDOG_LOG_EVERY = 3;
/**
 * Give up on the wallet after this long when nothing else ends the wait: a
 * durable-nonce transaction never expires, and a blockhash one cannot tell
 * when it has if the RPC will not report the block height.
 */
const SIGN_MAX_WAIT_MS = 180_000;
/**
 * Compute for the nonce advance when the caller measured `unitsConsumed`
 * without it. The system program's advance costs ~150 CU; this leaves room.
 */
const NONCE_ADVANCE_COMPUTE_UNITS = 300;
/** Stop waiting for the wallet to disconnect after this long, so the error still shows. */
const DISCONNECT_MAX_WAIT_MS = 3_000;

/** Why the wait for the wallet's signature was abandoned. */
export type WalletWaitEnd = 'blockhash-expired' | 'nonce-used' | 'too-long';

/**
 * The wallet never returned a signature while it could still land, so nothing
 * was sent and retrying is always safe.
 */
export class WalletSignatureTimeoutError extends Error {
  constructor(
    public readonly waitedMs: number,
    public readonly reason: WalletWaitEnd = 'blockhash-expired'
  ) {
    const seconds = Math.round(waitedMs / 1000);
    super(
      reason === 'nonce-used'
        ? `Another transaction used this wallet's durable nonce while the wallet was open ` +
            `(another tab?), so this one could never land. Nothing was sent. Try again.`
        : reason === 'too-long'
          ? `The wallet did not return a signature within ${seconds}s. Nothing was sent. ` +
            'Check the wallet (and hardware device, if any) and try again.'
          : `The wallet did not return a signature within ${seconds}s, ` +
            'and the transaction has expired unsigned. Nothing was sent. Check the wallet ' +
            '(and hardware device, if any) and try again. If signing on a hardware wallet ' +
            'takes longer than that, enable durable nonce signing in Settings.'
    );
    this.name = 'WalletSignatureTimeoutError';
  }
}

/**
 * `wallet.signTransaction`, bounded by the life of the transaction.
 *
 * A wallet prompt that never settles — extension hung, hardware device asleep,
 * popup dismissed without a rejection event — otherwise leaves the caller
 * awaiting forever with nothing in the console. So while the wallet has the
 * transaction, its lifetime is checked every few seconds: block height against
 * `lastValidBlockHeight` for a blockhash, the stored value for a durable nonce
 * (which only moves if another transaction used it). Once the transaction can
 * no longer land, or after `SIGN_MAX_WAIT_MS` regardless, the wait is
 * abandoned with a `WalletSignatureTimeoutError`. A signature that arrives
 * after that is dropped: sending it could only fail.
 */
async function signBeforeExpiry<T extends Transaction | VersionedTransaction>(
  connection: Connection,
  sign: () => Promise<T>,
  lifetime: TransactionLifetime,
  tag: string
): Promise<T> {
  const startedAt = Date.now();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let abandoned = false;

  /** Where the lifetime stands, or null if the RPC would not say. */
  const probe = async (): Promise<{ ended: WalletWaitEnd | null; left: string } | null> => {
    try {
      if (lifetime.kind === 'blockhash') {
        const blockHeight = await connection.getBlockHeight('confirmed');
        const left = lifetime.lastValidBlockHeight - blockHeight;
        if (left < 0) {
          console.error(`${tag} Blockhash expired while waiting for the wallet`, {
            blockHeight,
            lastValidBlockHeight: lifetime.lastValidBlockHeight,
          });
          return { ended: 'blockhash-expired', left: '0 blocks' };
        }
        return { ended: null, left: `${left} blocks of validity left` };
      }
      const nonce = await currentNonce(connection, lifetime.nonceAccount, lifetime.minContextSlot);
      if (nonce !== lifetime.nonce) {
        console.error(`${tag} Durable nonce changed while waiting for the wallet`, {
          signedWith: lifetime.nonce,
          now: nonce,
        });
        return { ended: 'nonce-used', left: 'nonce used' };
      }
      return { ended: null, left: 'durable nonce, no expiry' };
    } catch (error) {
      console.warn(`${tag} Lifetime check failed while waiting for the wallet:`, error);
      return null;
    }
  };

  const expiry = new Promise<never>((_, reject) => {
    let ticks = 0;
    const check = async () => {
      ticks += 1;
      const state = await probe();
      if (abandoned) return;
      const waitedMs = Date.now() - startedAt;

      const ended = state?.ended ?? (waitedMs > SIGN_MAX_WAIT_MS ? 'too-long' : null);
      if (ended) {
        abandoned = true;
        console.error(`${tag} Gave up waiting for the wallet after ${waitedMs}ms (${ended})`);
        reject(new WalletSignatureTimeoutError(waitedMs, ended));
        return;
      }

      if (ticks % SIGN_WATCHDOG_LOG_EVERY === 0) {
        console.warn(
          `${tag} Still waiting for the wallet after ${Math.round(waitedMs / 1000)}s, ` +
            (state?.left ?? 'lifetime unknown')
        );
      }
      timer = setTimeout(check, SIGN_WATCHDOG_INTERVAL_MS);
    };
    timer = setTimeout(check, SIGN_WATCHDOG_INTERVAL_MS);
  });

  try {
    return await Promise.race([sign(), expiry]);
  } finally {
    abandoned = true;
    clearTimeout(timer);
  }
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
  // writes to, unless the user set a price. Look up the wallet's durable nonce
  // alongside: unlike a blockhash it does not age, so fetching it this early
  // costs nothing, and the simulation below can then include its advance.
  const [microLamports, durableNonce] = await Promise.all([
    options.priorityFeeMicroLamports ??
      getPriorityFeeMicroLamports(
        connection,
        options.writableAccounts ?? writableAccountsOf(instructions)
      ),
    options.useDurableNonce === false ? null : lookUpDurableNonce(connection, payer, tag),
  ]);
  const advance = durableNonce ? [advanceNonceInstruction(durableNonce)] : [];

  // Size the compute limit to what simulation measured. The probe requests the
  // runtime's default budget so it is limited exactly the way the unbudgeted
  // transaction would have been.
  const defaultUnits = runtimeDefaultComputeUnits(instructions.length);
  let unitsConsumed = options.unitsConsumed;
  if (unitsConsumed && durableNonce) unitsConsumed += NONCE_ADVANCE_COMPUTE_UNITS;
  if (unitsConsumed === undefined) {
    const probe = shape.build(
      payer,
      [...advance, ...computeBudgetInstructions({ units: defaultUnits, microLamports })],
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

  // Budget instructions next — a compute budget applies to the whole
  // transaction regardless of position, but keeping them at the front matches
  // convention and keeps the decoded instruction list readable. Only the nonce
  // advance goes before them: the runtime requires it to be first.
  const budget = computeBudgetInstructions({ units, microLamports });
  const fits = (size: number | null): size is number => size !== null && size <= PACKET_DATA_SIZE;

  let transaction: T | null = null;
  let lifetime: TransactionLifetime | null = null;
  let sizeBytes: number | null = null;
  if (durableNonce) {
    transaction = shape.build(payer, [...advance, ...budget], durableNonce.nonce);
    sizeBytes = shape.size(transaction);
    if (fits(sizeBytes)) {
      lifetime = {
        kind: 'nonce',
        nonceAccount: durableNonce.address,
        nonce: durableNonce.nonce,
        minContextSlot: durableNonce.contextSlot,
      };
    } else {
      // The advance costs 106 bytes (an instruction and up to three new account
      // keys), which can tip a full batch over the packet limit. A blockhash transaction is
      // still better than none, so fall back if that fits.
      console.warn(
        `${tag} Too large with the durable nonce (${sizeBytes ?? `over ${PACKET_DATA_SIZE}`} bytes), ` +
          'falling back to a blockhash'
      );
    }
  }
  if (!lifetime) {
    // Fresh blockhash right before signing, so as little of the validity window
    // as possible is spent before the wallet prompts. 'confirmed' avoids handing
    // over one that is already ~31 blocks old.
    const { blockhash, lastValidBlockHeight } = await getSendableBlockhash(connection);
    transaction = shape.build(payer, budget, blockhash);
    sizeBytes = shape.size(transaction);
    lifetime = { kind: 'blockhash', lastValidBlockHeight };
  }

  // Checked after the leading instructions are in, since they count too.
  // Better a clear error here than a cryptic one from the wallet.
  if (!transaction || !fits(sizeBytes)) {
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
    ...describeLifetime(lifetime),
  });

  // Local keypairs sign before the wallet, so the wallet is handed a transaction
  // that needs only its own signature.
  const unsigned = transaction;
  if (options.signers?.length) {
    if (unsigned instanceof VersionedTransaction) unsigned.sign(options.signers);
    else unsigned.partialSign(...options.signers);
  }

  // Sign only, then broadcast via the app's connection. The wallet never sends,
  // so it doesn't need to be pointed at this network's RPC — the app always
  // submits to the configured endpoint. This also avoids the "Plugin Closed"
  // errors some wallets throw on send.
  options.onStep?.('signing');
  const startSign = Date.now();
  let signedTransaction: T;
  try {
    signedTransaction = await signBeforeExpiry(
      connection,
      () => wallet.signTransaction!(unsigned),
      lifetime,
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
  console.log(`${tag} Signed in ${Date.now() - startSign}ms`);
  options.onStep?.('confirming');

  const signature = await sendAndConfirm(connection, signedTransaction, lifetime, {
    label: options.label,
  });
  // Landing advanced the nonce. Remember the old value, so the next send does
  // not sign it again on the word of an RPC node that has not caught up.
  if (lifetime.kind === 'nonce') markNonceSpent(lifetime.nonceAccount, lifetime.nonce);
  return signature;
}

/**
 * The wallet's durable nonce, or null to use a blockhash. A failed lookup is
 * not fatal: a blockhash transaction still works, it just expires sooner.
 */
async function lookUpDurableNonce(
  connection: Connection,
  payer: PublicKey,
  tag: string
): Promise<DurableNonce | null> {
  try {
    return await fetchDurableNonce(connection, payer);
  } catch (error) {
    console.warn(`${tag} Could not read the durable nonce account; using a blockhash:`, error);
    return null;
  }
}
