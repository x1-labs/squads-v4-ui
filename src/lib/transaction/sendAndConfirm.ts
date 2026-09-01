import type {
  Connection,
  SignatureStatus,
  Transaction,
  VersionedTransaction,
} from '@solana/web3.js';

/** How often to ask the RPC where the signature stands. */
const POLL_INTERVAL_MS = 1_000;

/** Re-push the signed bytes every Nth poll while the cluster has not seen them at all. */
const REBROADCAST_EVERY = 2;

/** Check expiry every Nth poll — block height moves slower than we poll, and this trims the RPC load. */
const BLOCK_HEIGHT_CHECK_EVERY = 5;

/**
 * Extra status checks after block height passes the limit, before declaring
 * expiry. Behind a load-balanced RPC the height can come from a node a few slots
 * ahead of the one answering the status query; a transaction that landed in the
 * last block of its window needs a moment to show up there.
 */
const EXPIRY_GRACE_POLLS = 3;

/**
 * Hard wall-clock backstop. Expiry is normally decided by block height, but if
 * the RPC keeps failing every status and height query we would otherwise loop
 * forever. Blockhashes live ~60s; twice that means it is dead by any measure.
 */
const MAX_WAIT_MS = 120_000;

export type SendAndConfirmOptions = {
  /** Prefix for this call site's console output, e.g. 'ApproveButton'. */
  label?: string;
};

export class TransactionExpiredError extends Error {
  constructor(
    public readonly signature: string,
    /** Last status seen before giving up — `null` if the cluster never reported it. */
    public readonly lastStatus: SignatureStatus | null
  ) {
    super(
      lastStatus
        ? // Seen at 'processed' but never 'confirmed'. That block may yet be
          // confirmed by a lagging node's account, or may have been dropped by
          // a fork. Either way we cannot promise it did not happen.
          `Transaction was processed but not confirmed before its blockhash expired. ` +
            `Check the explorer for signature ${signature} before retrying.`
        : `Transaction expired without landing — it was never included in a block, so nothing changed on chain. ` +
            `Safe to retry. Signature: ${signature}`
    );
    this.name = 'TransactionExpiredError';
  }
}

export class TransactionFailedError extends Error {
  constructor(
    public readonly signature: string,
    public readonly err: unknown
  ) {
    const errorStr = JSON.stringify(err);
    super(
      errorStr.includes('InstructionError')
        ? `Transaction failed with an instruction error. Check the explorer for signature: ${signature}`
        : `Transaction failed: ${errorStr}`
    );
    this.name = 'TransactionFailedError';
  }
}

/** Thrown when the RPC stopped answering for so long that the outcome is unknowable. */
export class TransactionStatusUnknownError extends Error {
  constructor(public readonly signature: string) {
    super(
      `Could not determine whether the transaction landed — the RPC stopped responding. ` +
        `Check the explorer for signature ${signature} before retrying.`
    );
    this.name = 'TransactionStatusUnknownError';
  }
}

const landed = (status: SignatureStatus | null): boolean =>
  status?.confirmationStatus === 'confirmed' || status?.confirmationStatus === 'finalized';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Broadcast an already-signed transaction and wait for it to land.
 *
 * Replaces the previous `sendRawTransaction({ maxRetries: 3 })` + fixed-timeout
 * poll, which lost transactions in two distinct ways:
 *
 *   1. `maxRetries: 3` caps how many times the *RPC* re-pushes the transaction to
 *      the leader. web3.js otherwise retries until the blockhash expires (~1 min).
 *      Capped at three, a few dropped packets at leader ingress kill the
 *      transaction permanently and silently — it simply never appears on chain.
 *      We set `maxRetries: 0` and drive rebroadcast ourselves instead, which also
 *      keeps working when the RPC is a proxy that ignores the parameter.
 *
 *   2. The old poll gave up after a wall-clock timeout. Wall clock is not what
 *      expiry means on Solana: a transaction is alive until block height passes
 *      the `lastValidBlockHeight` that came with its blockhash (~150 blocks). A
 *      10s timeout reported "not found or expired" on transactions that still had
 *      ~50 seconds to land, and could not observe `finalized` (~13s minimum) at all.
 *
 * Resolves once the signature reaches `confirmed` — a supermajority has voted on
 * the block, which is the right bar for telling a user their click worked.
 * `finalized` costs another ~13s to say nothing more that a UI cares about.
 *
 * Polls rather than using `connection.confirmTransaction`, which opens a
 * websocket subscription; browser WS connections to proxied RPC endpoints are
 * frequently blocked, and would fail here in a way plain HTTP polling does not.
 *
 * A status or block-height query that fails is logged and retried on the next
 * tick, never surfaced: once the bytes are out, a 429 from the RPC says nothing
 * about the transaction, and reporting it as a failure would send the user back
 * to re-sign something that is about to confirm.
 */
export async function sendAndConfirm(
  connection: Connection,
  signedTransaction: Transaction | VersionedTransaction,
  lastValidBlockHeight: number,
  options: SendAndConfirmOptions = {}
): Promise<string> {
  const tag = `[${options.label ?? 'sendAndConfirm'}]`;
  const rawTransaction = signedTransaction.serialize();

  // First send keeps preflight on, so a transaction that cannot possibly succeed
  // surfaces its simulation error here rather than after a minute of retrying.
  const signature = await connection.sendRawTransaction(rawTransaction, {
    skipPreflight: false,
    maxRetries: 0,
  });
  console.log(`${tag} Sent, awaiting confirmation. Signature:`, signature);

  const startedAt = Date.now();
  let poll = 0;
  let lastStatus: SignatureStatus | null = null;

  const rebroadcast = () => {
    // Preflight is off on resends: the transaction was already validated on the
    // first send, and re-simulating one that is mid-flight wastes a round trip
    // and can spuriously fail.
    connection
      .sendRawTransaction(rawTransaction, { skipPreflight: true, maxRetries: 0 })
      .catch((error) => {
        // "already been processed" here means it landed while we were asking —
        // the next poll will see it. Any other resend error is equally
        // non-fatal, since the status poll is what decides the outcome.
        console.debug(`${tag} Rebroadcast attempt ${poll} did not stick:`, error?.message);
      });
  };

  const checkStatus = async (): Promise<SignatureStatus | null> => {
    const { value } = await connection.getSignatureStatuses([signature]);
    const status = value[0];
    if (status?.err) {
      // It landed and the program rejected it. Retrying won't help.
      throw new TransactionFailedError(signature, status.err);
    }
    if (status) lastStatus = status;
    return status;
  };

  while (true) {
    await sleep(POLL_INTERVAL_MS);
    poll += 1;

    if (Date.now() - startedAt > MAX_WAIT_MS) {
      console.error(`${tag} Gave up after ${MAX_WAIT_MS}ms; last status:`, lastStatus);
      throw new TransactionStatusUnknownError(signature);
    }

    let status: SignatureStatus | null;
    try {
      status = await checkStatus();
    } catch (error) {
      if (error instanceof TransactionFailedError) throw error;
      console.warn(`${tag} Status check ${poll} failed, will retry:`, error);
      continue;
    }

    if (landed(status)) {
      console.log(`${tag} Confirmed in ${Date.now() - startedAt}ms`, status);
      return signature;
    }

    // Only re-push while the cluster reports nothing at all. A 'processed'
    // status means the leader has it and it is waiting on votes, so another
    // copy buys nothing but an "already processed" error.
    if (!status && poll % REBROADCAST_EVERY === 0) rebroadcast();

    if (poll % BLOCK_HEIGHT_CHECK_EVERY !== 0) continue;

    let blockHeight: number;
    try {
      blockHeight = await connection.getBlockHeight('confirmed');
    } catch (error) {
      console.warn(`${tag} Block height check failed, will retry:`, error);
      continue;
    }
    if (blockHeight <= lastValidBlockHeight) continue;

    // The blockhash is dead, so this exact transaction can never be included in
    // a new block. It may still have landed in one of the last blocks of its
    // window, which a lagging status node has not reported yet — give that a
    // few more polls before calling it.
    for (let grace = 0; grace < EXPIRY_GRACE_POLLS; grace++) {
      await sleep(POLL_INTERVAL_MS);
      try {
        if (landed(await checkStatus())) {
          console.log(`${tag} Confirmed after expiry on grace poll ${grace + 1}`, lastStatus);
          return signature;
        }
      } catch (error) {
        if (error instanceof TransactionFailedError) throw error;
        console.warn(`${tag} Grace status check ${grace + 1} failed:`, error);
      }
    }

    console.warn(
      `${tag} Expired at block height`,
      blockHeight,
      '>',
      lastValidBlockHeight,
      'last status:',
      lastStatus
    );
    throw new TransactionExpiredError(signature, lastStatus);
  }
}

/**
 * Blockhash for a transaction that is about to be signed and sent.
 *
 * Explicitly `confirmed`, never the connection default. An RPC's default
 * commitment is `finalized`, which hands back a blockhash roughly 31 blocks
 * (~12s) old — a fifth of the ~150-block validity window already spent before
 * the wallet has even prompted the user. On a hardware wallet, where approval
 * itself can take 30s, that difference decides whether the transaction lands.
 */
export async function getSendableBlockhash(connection: Connection) {
  return connection.getLatestBlockhash('confirmed');
}
