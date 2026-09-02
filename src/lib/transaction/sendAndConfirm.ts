import { SendTransactionError, VersionedTransaction } from '@solana/web3.js';
import type { Connection, SignatureStatus, Transaction } from '@solana/web3.js';
import bs58 from 'bs58';

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
 * Backstop on RPC silence. Expiry is normally decided by block height, but if
 * the RPC fails every status and height query we would otherwise loop forever.
 * Measured from the last query that got an answer, not from the send, so a
 * slow-but-working RPC is never cut off mid-flight. Blockhashes live ~60s;
 * twice that with no word from the RPC means the outcome cannot be known here.
 */
const MAX_RPC_SILENCE_MS = 120_000;

/**
 * Absolute cap, whatever the RPC says. Reached only if status queries answer
 * but the height query never does (or never advances), which would otherwise
 * keep the poll alive indefinitely.
 */
const MAX_TOTAL_WAIT_MS = 300_000;

export type SendAndConfirmOptions = {
  /** Prefix for this call site's console output, e.g. 'ApproveButton'. */
  label?: string;
};

/**
 * The RPC host alone. Provider URLs carry the API key in the path or query
 * (QuickNode, Helius), and these logs get pasted into bug reports.
 */
export function describeRpc(endpoint: string): string {
  try {
    return new URL(endpoint).host;
  } catch {
    return endpoint;
  }
}

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

const landed = (status: SignatureStatus | null | undefined): boolean =>
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

  // The signature is the first one on the transaction, and is known before the
  // send. Computing it here rather than trusting the send's return value means
  // a send whose answer never arrives can still be tracked.
  const signature = bs58.encode(
    signedTransaction instanceof VersionedTransaction
      ? signedTransaction.signatures[0]
      : signedTransaction.signature!
  );

  // First send keeps preflight on, so a transaction that cannot possibly succeed
  // surfaces its simulation error here rather than after a minute of retrying.
  // Preflight at 'processed': the blockhash was fetched at 'confirmed', and a
  // pooled RPC may route this call to a node whose 'confirmed' view has not yet
  // reached that slot, which would reject a perfectly good transaction with
  // "Blockhash not found".
  try {
    await connection.sendRawTransaction(rawTransaction, {
      skipPreflight: false,
      preflightCommitment: 'processed',
      maxRetries: 0,
    });
  } catch (error) {
    if (error instanceof SendTransactionError) {
      // A JSON-RPC error: the node looked at the transaction and turned it down
      // (preflight failure, unknown blockhash, ...). It was not forwarded.
      console.error(`${tag} The RPC rejected the send, nothing was submitted:`, error, {
        rpc: describeRpc(connection.rpcEndpoint),
        lastValidBlockHeight,
      });
      throw error;
    }
    // Transport failure — fetch error, 429, 502, a proxy timeout. The request
    // may have reached the node and been forwarded before the answer was lost,
    // so this is not "nothing was submitted": treat it as sent and let the
    // status poll decide. If the cluster really never saw it, the rebroadcast
    // below pushes it again; if it did, reporting failure here would send the
    // user back to sign a duplicate.
    console.warn(`${tag} The send got no answer; the RPC may still have forwarded it:`, error, {
      rpc: describeRpc(connection.rpcEndpoint),
      signature,
      lastValidBlockHeight,
    });
  }
  console.log(`${tag} Sent, awaiting confirmation. Signature:`, signature);

  const startedAt = Date.now();
  let lastAnswerAt = startedAt;
  let poll = 0;
  let rebroadcasts = 0;
  let lastStatus: SignatureStatus | null = null;
  let lastLoggedStatus = '';
  let lastBlockHeight: number | null = null;

  const elapsed = () => `${((Date.now() - startedAt) / 1000).toFixed(1)}s`;

  // Everything needed to work out what happened to a signature, logged on every
  // exit. This is the object to paste into a bug report.
  const report = () => ({
    signature,
    rpc: describeRpc(connection.rpcEndpoint),
    elapsedMs: Date.now() - startedAt,
    polls: poll,
    rebroadcasts,
    lastValidBlockHeight,
    lastSeenBlockHeight: lastBlockHeight,
    lastStatus,
  });

  const logStatus = (status: SignatureStatus | null) => {
    const seen = status?.confirmationStatus ?? 'not seen by cluster';
    if (seen === lastLoggedStatus) return;
    lastLoggedStatus = seen;
    console.log(`${tag} Status after ${elapsed()}: ${seen}`);
  };

  const rebroadcast = () => {
    rebroadcasts += 1;
    console.log(`${tag} Rebroadcast #${rebroadcasts} after ${elapsed()}, cluster has not seen it`);
    // Preflight is off on resends: the transaction was already validated on the
    // first send, and re-simulating one that is mid-flight wastes a round trip
    // and can spuriously fail.
    connection
      .sendRawTransaction(rawTransaction, { skipPreflight: true, maxRetries: 0 })
      .catch((error) => {
        // "already been processed" here means it landed while we were asking —
        // the next poll will see it. Any other resend error is equally
        // non-fatal, since the status poll is what decides the outcome.
        console.log(`${tag} Rebroadcast #${rebroadcasts} did not stick:`, error?.message);
      });
  };

  const checkStatus = async (): Promise<SignatureStatus | null> => {
    const { value } = await connection.getSignatureStatuses([signature]);
    lastAnswerAt = Date.now();
    const status = value[0];
    if (status?.err) {
      // It landed and the program rejected it. Retrying won't help.
      throw new TransactionFailedError(signature, status.err);
    }
    if (status) lastStatus = status;
    return status;
  };

  /**
   * One status query, logged. `null` is the cluster saying it has not seen the
   * signature; `undefined` is the query itself failing, which says nothing
   * about the transaction and is only ever worth retrying. A transaction that
   * landed and was rejected on chain throws — the one fatal outcome.
   */
  const pollStatus = async (what: string): Promise<SignatureStatus | null | undefined> => {
    let status: SignatureStatus | null;
    try {
      status = await checkStatus();
    } catch (error) {
      if (error instanceof TransactionFailedError) {
        console.error(`${tag} Failed on chain:`, error.err, report());
        throw error;
      }
      console.warn(`${tag} ${what} failed, will retry:`, error);
      return undefined;
    }
    logStatus(status);
    return status;
  };

  while (true) {
    await sleep(POLL_INTERVAL_MS);
    poll += 1;

    if (Date.now() - lastAnswerAt > MAX_RPC_SILENCE_MS) {
      console.error(`${tag} No RPC answer for ${MAX_RPC_SILENCE_MS}ms, outcome unknown:`, report());
      throw new TransactionStatusUnknownError(signature);
    }
    if (Date.now() - startedAt > MAX_TOTAL_WAIT_MS) {
      console.error(`${tag} Unresolved after ${MAX_TOTAL_WAIT_MS}ms, outcome unknown:`, report());
      throw new TransactionStatusUnknownError(signature);
    }

    const status = await pollStatus(`Status check ${poll}`);
    if (status === undefined) continue;

    if (landed(status)) {
      console.log(`${tag} Confirmed after ${elapsed()}`, report());
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
    lastAnswerAt = Date.now();
    lastBlockHeight = blockHeight;
    console.log(
      `${tag} Block height ${blockHeight} of ${lastValidBlockHeight}, ` +
        `${Math.max(0, lastValidBlockHeight - blockHeight)} blocks of validity left`
    );
    if (blockHeight <= lastValidBlockHeight) continue;

    // The blockhash is dead, so this exact transaction can never be included in
    // a new block. It may still have landed in one of the last blocks of its
    // window, which a lagging status node has not reported yet — give that a
    // few more polls before calling it.
    for (let grace = 0; grace < EXPIRY_GRACE_POLLS; grace++) {
      await sleep(POLL_INTERVAL_MS);
      // No rebroadcast here, and no backstop check: the blockhash is dead, so
      // these polls only ask whether it already landed.
      if (landed(await pollStatus(`Grace status check ${grace + 1}`))) {
        console.log(`${tag} Confirmed on grace poll ${grace + 1} after expiry`, report());
        return signature;
      }
    }

    console.error(`${tag} Blockhash expired before the transaction landed:`, report());
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
