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
  /** Prefix for console output, e.g. 'ApproveButton'. */
  label: string;
  /** Progress callback: 'signing' right before the wallet prompt, 'confirming' once signed. */
  onStep?: (step: SendStep) => void;
  /** Appended to the error when the transaction exceeds the packet size, e.g. 'Select fewer proposals.' */
  tooLargeHint?: string;
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
  const lastLog = [...logs].reverse().find((log) => /error|failed/i.test(log));
  return `Transaction simulation failed: ${lastLog ?? JSON.stringify(err)}`;
}

/**
 * The send pipeline shared by every proposal action and batch:
 *
 *   1. price a priority fee from the fee market for `writableAccounts`;
 *   2. simulate to measure compute, unless the caller already did;
 *   3. fetch a fresh blockhash, build the final transaction with the budget
 *      instructions in front, and check it fits in a packet;
 *   4. have the wallet sign; then
 *   5. broadcast and rebroadcast until the signature confirms or the blockhash expires.
 *
 * Resolves with the signature. Throws `SimulationFailedError` before the wallet
 * prompt, `TransactionFailedError` / `TransactionExpiredError` /
 * `TransactionStatusUnknownError` from `sendAndConfirm`, or the wallet's own
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
/** Give up on the wallet after this long if the RPC will not tell us the block height. */
const SIGN_MAX_WAIT_MS = 180_000;

/**
 * The wallet never returned a signature, or returned it after the blockhash it
 * signed had died. Nothing was sent either way, so retrying is always safe.
 */
export class WalletSignatureTimeoutError extends Error {
  constructor(public readonly waitedMs: number) {
    super(
      `The wallet did not return a signature within ${Math.round(waitedMs / 1000)}s, ` +
        'and the transaction has expired unsigned. Nothing was sent. Check the wallet ' +
        '(and hardware device, if any) and try again.'
    );
    this.name = 'WalletSignatureTimeoutError';
  }
}

/**
 * `wallet.signTransaction`, bounded by the life of the blockhash in the message.
 *
 * A wallet prompt that never settles — extension hung, hardware device asleep,
 * popup dismissed without a rejection event — otherwise leaves the caller
 * awaiting forever with nothing in the console. So while the wallet has the
 * transaction, the block height is checked every few seconds; once it passes
 * `lastValidBlockHeight` the signature can no longer land and the wait is
 * abandoned with a `WalletSignatureTimeoutError`. A signature that arrives
 * after that is dropped: sending it would only produce "Blockhash not found".
 */
async function signBeforeExpiry<T extends Transaction | VersionedTransaction>(
  connection: Connection,
  sign: () => Promise<T>,
  lastValidBlockHeight: number,
  tag: string
): Promise<T> {
  const startedAt = Date.now();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let abandoned = false;

  const expiry = new Promise<never>((_, reject) => {
    let ticks = 0;
    const check = async () => {
      ticks += 1;
      const waitedMs = Date.now() - startedAt;
      let blockHeight: number | null = null;
      try {
        blockHeight = await connection.getBlockHeight('confirmed');
      } catch (error) {
        console.warn(`${tag} Block height lookup failed while waiting for the wallet:`, error);
      }
      if (abandoned) return;

      const expired =
        blockHeight !== null ? blockHeight > lastValidBlockHeight : waitedMs > SIGN_MAX_WAIT_MS;
      if (expired) {
        abandoned = true;
        console.error(`${tag} Gave up waiting for the wallet after ${waitedMs}ms`, {
          blockHeight,
          lastValidBlockHeight,
        });
        reject(new WalletSignatureTimeoutError(waitedMs));
        return;
      }

      if (ticks % SIGN_WATCHDOG_LOG_EVERY === 0) {
        const left = blockHeight !== null ? `${lastValidBlockHeight - blockHeight}` : 'unknown';
        console.warn(
          `${tag} Still waiting for the wallet after ${Math.round(waitedMs / 1000)}s, ` +
            `${left} blocks of validity left`
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

  // Price the transaction against what recently landed on the accounts it writes to.
  const microLamports = await getPriorityFeeMicroLamports(
    connection,
    options.writableAccounts ?? writableAccountsOf(instructions)
  );

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
  const units = unitsConsumed ? sizeComputeUnitLimit(unitsConsumed) : defaultUnits;

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

  // Sign only, then broadcast via the app's connection. The wallet never sends,
  // so it doesn't need to be pointed at this network's RPC — the app always
  // submits to the configured endpoint. This also avoids the "Plugin Closed"
  // errors some wallets throw on send.
  options.onStep?.('signing');
  const startSign = Date.now();
  const signedTransaction = await signBeforeExpiry(
    connection,
    () => wallet.signTransaction!(transaction),
    lastValidBlockHeight,
    tag
  );
  console.log(`${tag} Signed in ${Date.now() - startSign}ms`);
  options.onStep?.('confirming');

  return sendAndConfirm(connection, signedTransaction, lastValidBlockHeight, {
    label: options.label,
  });
}
