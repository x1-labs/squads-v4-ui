import type { AccountInfo, Connection, PublicKey } from '@solana/web3.js';

/**
 * Whether a transaction is stale: created before the multisig's last config
 * change. Matches the program's check in proposal_vote.rs, which refuses
 * approve/reject unless `transaction_index > stale_transaction_index`.
 */
export function isTransactionStale(
  staleTransactionIndex: bigint | number,
  transactionIndex: bigint | number
): boolean {
  return BigInt(transactionIndex) <= BigInt(staleTransactionIndex);
}

/** getMultipleAccountsInfo accepts at most 100 addresses per call. */
const MAX_ACCOUNTS_PER_CALL = 100;

/**
 * getMultipleAccountsInfo for any number of addresses: chunks of 100, fetched in
 * parallel, results in input order. Throws if any chunk fails, so callers never
 * mistake an RPC error for a missing account.
 */
export async function getMultipleAccountsInfoChunked(
  connection: Connection,
  addresses: PublicKey[]
): Promise<(AccountInfo<Buffer> | null)[]> {
  const chunks: PublicKey[][] = [];
  for (let start = 0; start < addresses.length; start += MAX_ACCOUNTS_PER_CALL) {
    chunks.push(addresses.slice(start, start + MAX_ACCOUNTS_PER_CALL));
  }
  const results = await Promise.all(chunks.map((chunk) => connection.getMultipleAccountsInfo(chunk)));
  return results.flat();
}
