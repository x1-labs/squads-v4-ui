import { Connection, SignatureStatus, Transaction, VersionedTransaction } from '@solana/web3.js';

/** How often to re-push the signed bytes at the RPC while we wait. */
const REBROADCAST_INTERVAL_MS = 2_000;

/** Check expiry every Nth poll — block height moves slower than we poll, and this halves the RPC load. */
const BLOCK_HEIGHT_CHECK_EVERY = 3;

export type SendAndConfirmOptions = {
  /** Prefix for this call site's console output, e.g. 'ApproveButton'. */
  label?: string;
};

export class TransactionExpiredError extends Error {
  constructor(public readonly signature: string) {
    super(
      `Transaction expired without landing — it was never included in a block, so nothing changed on chain. ` +
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

const landed = (status: SignatureStatus | null): boolean =>
  status?.confirmationStatus === 'confirmed' || status?.confirmationStatus === 'finalized';

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

  while (true) {
    await new Promise((resolve) => setTimeout(resolve, REBROADCAST_INTERVAL_MS));
    poll += 1;

    const { value } = await connection.getSignatureStatuses([signature]);
    const status = value[0];

    if (status?.err) {
      // It landed and the program rejected it. Retrying won't help.
      throw new TransactionFailedError(signature, status.err);
    }

    if (landed(status)) {
      console.log(`${tag} Confirmed in ${Date.now() - startedAt}ms`, status);
      return signature;
    }

    // Still in flight. Push the same bytes again — the leader may have dropped
    // every earlier attempt. Preflight is off on resends: the transaction was
    // already validated on the first send, and re-simulating one that is
    // mid-flight wastes a round trip and can spuriously fail.
    connection
      .sendRawTransaction(rawTransaction, { skipPreflight: true, maxRetries: 0 })
      .catch((error) => {
        // "already been processed" here means it landed while we were asking —
        // the next poll will see it. Any other resend error is equally
        // non-fatal, since the poll above is what decides the outcome.
        console.debug(`${tag} Rebroadcast attempt ${poll} did not stick:`, error?.message);
      });

    if (poll % BLOCK_HEIGHT_CHECK_EVERY === 0) {
      const blockHeight = await connection.getBlockHeight('confirmed');
      if (blockHeight > lastValidBlockHeight) {
        // The blockhash is dead, so this exact transaction can never land now.
        // Check once more first: it may have been included in the final block
        // between our last poll and the height moving past the limit.
        const { value: finalValue } = await connection.getSignatureStatuses([signature]);
        const finalStatus = finalValue[0];

        if (finalStatus?.err) throw new TransactionFailedError(signature, finalStatus.err);
        if (landed(finalStatus)) {
          console.log(`${tag} Confirmed on the final check`, finalStatus);
          return signature;
        }

        console.warn(`${tag} Expired at block height`, blockHeight, '>', lastValidBlockHeight);
        throw new TransactionExpiredError(signature);
      }
    }
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
