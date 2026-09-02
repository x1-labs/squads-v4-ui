import { useQuery } from '@tanstack/react-query';
import { useMultisigData } from './useMultisigData';
import { detectNetwork, type GenesisHashCache, type NetworkConfig } from '@/lib/network';

// Last genesis hash seen from each endpoint, kept between page loads so a
// momentarily unreachable RPC does not cost the app its idea of the cluster.
// It is not trusted while the endpoint is answering — see `detectNetwork`.
const CACHE_PREFIX = 'x-genesis-hash:';

const localStorageCache: GenesisHashCache = {
  read: (rpcUrl) => {
    if (typeof window === 'undefined') return null;
    try {
      return localStorage.getItem(CACHE_PREFIX + rpcUrl);
    } catch {
      // Private browsing and blocked storage both throw here.
      return null;
    }
  },
  write: (rpcUrl, hash) => {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(CACHE_PREFIX + rpcUrl, hash);
    } catch {
      // Caching is an optimisation. Losing it is not an error.
    }
  },
};

/**
 * Identify the cluster the current RPC actually serves.
 *
 * Resolves from the genesis hash, which the connection reports directly, and
 * falls back to URL matching when the hash is unrecognised (a local validator,
 * or a chain absent from NETWORKS). One lookup per endpoint per page load:
 * `staleTime: Infinity` keeps it from repeating within a session, and a reload
 * is the moment where a repointed endpoint has to be noticed.
 *
 * `network` is null until detection resolves. Callers that act on the network
 * MUST wait for it rather than treating null as a default, or they reintroduce
 * as a race the very mismatch this hook exists to remove.
 */
export const useNetwork = (): { network: NetworkConfig | null; isLoading: boolean } => {
  const { connection, rpcUrl } = useMultisigData();

  const { data, isLoading } = useQuery({
    queryKey: ['genesisHash', rpcUrl],
    queryFn: () => detectNetwork(connection, rpcUrl, localStorageCache),
    staleTime: Infinity,
    gcTime: Infinity,
    retry: 1,
    refetchOnWindowFocus: false,
  });

  // An RPC that is unreachable and has never been seen before leaves `network`
  // null, which callers treat as "not resolved yet". That is the safe
  // direction: they hold rather than guess.
  return { network: data ?? null, isLoading };
};
