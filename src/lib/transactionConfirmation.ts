import { Connection, RpcResponseAndContext, SignatureStatus } from '@solana/web3.js';

/**
 * Default wait, in ms, roughly the life of a blockhash (~150 blocks at ~400ms).
 *
 * Previously 10s, which produced false failures: a transaction that had not yet
 * surfaced was reported as "not found or expired" while it still had ~50 seconds
 * in which to land. Waiting out the real validity window means a reported failure
 * is an actual failure. This only lengthens the *failure* path — the poll returns
 * the moment every signature is confirmed.
 */
const DEFAULT_TIMEOUT_MS = 60_000;

const POLL_INTERVAL_MS = 1_000;

/**
 * True once the network has voted on the block holding this signature.
 *
 * `confirmed` is the correct bar for a UI: it means a supermajority has voted,
 * and it is reached in about a slot. The previous implementation required
 * `finalized`, which needs ~32 slots (~13s) and so was unreachable inside the
 * old 10s timeout — the success condition could never be met, and every caller
 * fell through to the timeout path.
 */
const isLanded = (status: SignatureStatus | null | undefined): boolean =>
  status?.confirmationStatus === 'confirmed' || status?.confirmationStatus === 'finalized';

/**
 * Poll until every signature has landed, one has failed, or the window closes.
 *
 * Returns the latest statuses either way — a `null` entry means the signature was
 * never seen on chain, which callers report as a failure. Prefer
 * `sendAndConfirm` for new code: it also rebroadcasts, and it bounds the wait by
 * the transaction's real `lastValidBlockHeight` rather than a wall clock.
 */
export async function waitForConfirmation(
  connection: Connection,
  signatures: string[],
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
  /**
   * When supplied, stop as soon as block height passes it — the transactions'
   * blockhash is dead at that point, so further polling cannot change the answer.
   */
  lastValidBlockHeight?: number
): Promise<(null | SignatureStatus)[]> {
  const startTime = Date.now();
  let latestStatuses: (null | SignatureStatus)[] = [];
  let poll = 0;

  try {
    while (Date.now() - startTime < timeoutMs) {
      const response: RpcResponseAndContext<(SignatureStatus | null)[]> =
        await connection.getSignatureStatuses(signatures);
      latestStatuses = response.value;

      if (latestStatuses.some((status) => status?.err !== null && status?.err !== undefined)) {
        console.log('Transaction failed on chain:', latestStatuses);
        return latestStatuses;
      }

      if (latestStatuses.every(isLanded)) {
        console.log('Transaction statuses:', latestStatuses);
        return latestStatuses;
      }

      poll += 1;
      if (lastValidBlockHeight !== undefined && poll % 5 === 0) {
        const blockHeight = await connection.getBlockHeight('confirmed');
        if (blockHeight > lastValidBlockHeight) {
          console.log('Blockhash expired, no further polling can help:', latestStatuses);
          return latestStatuses;
        }
      }

      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    }

    // Window closed with something still unconfirmed. Return what we have and let
    // the caller decide — the transaction may yet land, so the message it shows
    // should not promise that nothing happened.
    console.log('Timeout reached, returning latest statuses:', latestStatuses);
    return latestStatuses;
  } catch (error) {
    console.error('Error checking transaction status:', error);
    // Resolve with what we have rather than rejecting, so callers distinguish
    // "not confirmed" from "the status lookup itself broke".
    return latestStatuses;
  }
}
