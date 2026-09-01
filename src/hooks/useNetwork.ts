import { useQuery } from '@tanstack/react-query';
import { useMultisigData } from './useMultisigData';
import { getCurrentNetwork, networkFromGenesisHash, type NetworkConfig } from '@/lib/network';

// A genesis hash is immutable for a given endpoint, so the result is cached in
// localStorage and never revalidated. Detection costs one RPC call the first
// time a user points at a new endpoint, and nothing afterwards.
const CACHE_PREFIX = 'x-genesis-hash:';

const readCache = (rpcUrl: string): string | null => {
  if (typeof window === 'undefined') return null;
  try {
    return localStorage.getItem(CACHE_PREFIX + rpcUrl);
  } catch {
    // Private browsing and blocked storage both throw here.
    return null;
  }
};

const writeCache = (rpcUrl: string, hash: string): void => {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(CACHE_PREFIX + rpcUrl, hash);
  } catch {
    // Caching is an optimisation. Losing it is not an error.
  }
};

/**
 * Identify the cluster the current RPC actually serves.
 *
 * Resolves from the genesis hash, which the connection reports directly, and
 * falls back to URL matching when the hash is unrecognised (a local validator,
 * or a chain absent from NETWORKS).
 *
 * `network` is null until detection resolves. Callers that act on the network
 * MUST wait for it rather than treating null as a default, or they reintroduce
 * as a race the very mismatch this hook exists to remove.
 */
export const useNetwork = (): { network: NetworkConfig | null; isLoading: boolean } => {
  const { connection, rpcUrl } = useMultisigData();

  const { data, isLoading } = useQuery({
    queryKey: ['genesisHash', rpcUrl],
    queryFn: async (): Promise<NetworkConfig> => {
      const cached = readCache(rpcUrl);
      if (cached) {
        return networkFromGenesisHash(cached) ?? getCurrentNetwork(rpcUrl);
      }

      const hash = await connection.getGenesisHash();
      writeCache(rpcUrl, hash);
      return networkFromGenesisHash(hash) ?? getCurrentNetwork(rpcUrl);
    },
    staleTime: Infinity,
    gcTime: Infinity,
    retry: 1,
    refetchOnWindowFocus: false,
  });

  // An unreachable RPC leaves `network` null, which callers treat as "not
  // resolved yet". That is the safe direction: they hold rather than guess.
  return { network: data ?? null, isLoading };
};
