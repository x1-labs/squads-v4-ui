import { Connection, PublicKey } from '@solana/web3.js';
import { BorshAccountsCoder } from '@coral-xyz/anchor';

const CACHE_TTL_MS = 30_000;

interface CacheEntry {
  fetchedAt: number;
  value: Promise<unknown>;
}

/**
 * Build a cached account reader for an Anchor IDL.
 *
 * Instruction summaries use these to show what a proposal *changes* rather than
 * only what it sets, and several summaries can render for one transaction, so
 * reads are briefly cached.
 *
 * Cache keys include the RPC endpoint because a program deployed to more than
 * one chain under the same ID (as the bridge is) derives identical PDA
 * addresses on each — without it, switching networks could serve another
 * chain's state.
 */
export function createAnchorAccountFetcher(idl: unknown, programLabel: string) {
  let coder: BorshAccountsCoder | null | undefined;
  const cache = new Map<string, CacheEntry>();

  function getCoder(): BorshAccountsCoder | null {
    if (coder === undefined) {
      try {
        coder = new BorshAccountsCoder(idl as any);
      } catch (error) {
        console.warn(`Failed to build ${programLabel} accounts coder:`, error);
        coder = null;
      }
    }
    return coder;
  }

  /**
   * Fetch and decode one account. Resolves to null when the account is missing
   * or cannot be decoded; failures are not cached, so a transient RPC error
   * doesn't suppress the value for the rest of the TTL.
   */
  return function fetchAccount<T>(
    connection: Connection,
    accountName: string,
    address: PublicKey
  ): Promise<T | null> {
    const cacheKey = `${connection.rpcEndpoint}:${accountName}:${address.toBase58()}`;
    const cached = cache.get(cacheKey);
    if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
      return cached.value as Promise<T | null>;
    }

    const value = (async () => {
      const activeCoder = getCoder();
      if (!activeCoder) return null;

      try {
        const info = await connection.getAccountInfo(address);
        if (!info) return null;
        return activeCoder.decode<T>(accountName, info.data);
      } catch (error) {
        console.warn(
          `Failed to fetch ${programLabel} ${accountName} at ${address.toBase58()}:`,
          error
        );
        return null;
      }
    })();

    value.then((result) => {
      if (result === null) cache.delete(cacheKey);
    });

    cache.set(cacheKey, { fetchedAt: Date.now(), value });
    return value as Promise<T | null>;
  };
}
