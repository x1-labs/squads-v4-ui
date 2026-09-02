/**
 * Network identity for the single codebase we deploy to several chains.
 *
 * The same bundle serves X1 Mainnet, X1 Testnet and Solana Mainnet; which one
 * a given page is talking to is decided by env vars at build time (locally) or
 * by the Vercel project's dashboard settings (in production), so there is no
 * single build-time constant to read. What we always have at runtime is the
 * effective RPC URL and the hostname, and that is what we match on here.
 */

export type NativeSymbol = 'XNT' | 'SOL';

export type NetworkConfig = {
  id: string;
  name: string;
  url: string;
  rpcUrl: string;
  /** Ticker for the chain's native token — what balances and fees are denominated in. */
  nativeSymbol: NativeSymbol;
  /**
   * The chain's genesis hash. Authoritative: it comes from the connection
   * itself rather than from a URL, so it survives any provider or override.
   * Prefer `networkFromGenesisHash` over `markers` wherever an async lookup
   * is possible.
   */
  genesisHash: string;
  /**
   * Substrings that identify this network inside a hostname or an RPC URL.
   * Matched against whole URLs, so they cover our own domains as well as
   * third-party providers (QuickNode, Helius, …) whose host names carry the
   * cluster in them.
   *
   * A heuristic, and only a fallback for endpoints whose genesis hash we do
   * not recognise. Hostnames lie: `mainnet.helius-rpc.com` serves Solana but
   * matches the X1 Mainnet marker `mainnet`.
   */
  markers: string[];
};

/** Display order for the network switcher. */
export const NETWORKS: NetworkConfig[] = [
  {
    id: 'x1-mainnet',
    name: 'X1 Mainnet',
    url: 'https://multisig.mainnet.x1.xyz',
    rpcUrl: 'https://rpc.mainnet.x1.xyz',
    nativeSymbol: 'XNT',
    genesisHash: '4SvBP3omtvcCVWdxq1zBY5cDp4wndjsThb6nEMn6iMdN',
    markers: ['mainnet.x1.xyz', 'rpc.x1.xyz', 'multisig.x1.xyz', 'mainnet'],
  },
  {
    id: 'x1-testnet',
    name: 'X1 Testnet',
    url: 'https://multisig.testnet.x1.xyz',
    rpcUrl: 'https://rpc.testnet.x1.xyz',
    nativeSymbol: 'XNT',
    genesisHash: 'C7ucgdDEhxLTpXHhWSZxavSVmaNTUJWwT5iTdeaviDho',
    markers: ['testnet'],
  },
  {
    id: 'solana-mainnet',
    name: 'Solana Mainnet',
    url: 'https://multisig.solana-mainnet.x1.xyz',
    rpcUrl: 'https://api.mainnet-beta.solana.com',
    nativeSymbol: 'SOL',
    genesisHash: '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d',
    markers: ['solana-mainnet', 'solana_mainnet', 'mainnet-beta', 'solana.com'],
  },
];

export const DEFAULT_NETWORK = NETWORKS[0];

/**
 * Match order, most specific first. `solana-mainnet` contains `mainnet`, and
 * `rpc.testnet.x1.xyz` contains `x1.xyz`, so a naive pass over NETWORKS in
 * display order would hand Solana and testnet URLs to X1 Mainnet.
 */
const MATCH_ORDER = ['solana-mainnet', 'x1-testnet', 'x1-mainnet'];

/**
 * Resolve a hostname or RPC URL to a network, or null when nothing matches
 * (localhost, a private RPC whose host says nothing about the cluster).
 *
 * Deliberately substring-based rather than exact-URL: the Solana deployment
 * runs against a QuickNode endpoint, not `api.mainnet-beta.solana.com`, and
 * an operator can point any deployment at any provider from Settings.
 */
export const matchNetwork = (value: string | undefined | null): NetworkConfig | null => {
  if (!value) return null;
  const haystack = value.toLowerCase();

  for (const id of MATCH_ORDER) {
    const network = NETWORKS.find((n) => n.id === id);
    if (network?.markers.some((marker) => haystack.includes(marker))) {
      return network;
    }
  }
  return null;
};

/**
 * The network this page belongs to, for switcher UI and cross-network links.
 *
 * Hostname wins here: it is the deployment's own identity, and it keeps
 * Vercel preview branches (`…-solana-mainnet-….vercel.app`) pointing at the
 * right sibling deployments even before any RPC override is read.
 */
export const getCurrentNetwork = (currentRpcUrl: string): NetworkConfig => {
  const hostname = typeof window !== 'undefined' ? window.location.hostname : '';
  return matchNetwork(hostname) ?? matchNetwork(currentRpcUrl) ?? DEFAULT_NETWORK;
};

/**
 * Ticker to label native-token amounts with — SOL on Solana, XNT on X1.
 *
 * Note the precedence is the inverse of `getCurrentNetwork`: a symbol names
 * the chain whose lamports we are actually displaying, and that is decided by
 * the RPC endpoint, which a Settings override can repoint independently of the
 * host we are served from. Hostname is only the fallback for endpoints that
 * give nothing away (localhost, a bare IP, a private relay).
 */
export const getNativeSymbol = (rpcUrl?: string | null): NativeSymbol => {
  const hostname = typeof window !== 'undefined' ? window.location.hostname : '';
  return (matchNetwork(rpcUrl) ?? matchNetwork(hostname) ?? DEFAULT_NETWORK).nativeSymbol;
};

/**
 * Resolve a genesis hash to a network, or null when it is unrecognised.
 *
 * This is the authoritative answer: a genesis hash identifies a chain and
 * cannot be spoofed by a URL. Callers fall back to `getCurrentNetwork` on
 * null, which covers local validators and any chain not in NETWORKS.
 */
export const networkFromGenesisHash = (hash: string | null | undefined): NetworkConfig | null => {
  if (!hash) return null;
  return NETWORKS.find((network) => network.genesisHash === hash) ?? null;
};

/**
 * Where a previously observed genesis hash is kept between page loads, keyed by
 * RPC URL. Injected so the detection logic can be tested without a browser.
 */
export type GenesisHashCache = {
  read: (rpcUrl: string) => string | null;
  write: (rpcUrl: string, hash: string) => void;
};

/**
 * Identify the cluster an endpoint actually serves, asking the endpoint itself.
 *
 * The genesis hash is queried every time rather than read from the cache, even
 * though a *chain's* hash never changes: what can change is which chain a given
 * URL points at. A local validator is reset with a new genesis, a proxy or a
 * saved Settings URL is repointed at another cluster, `localhost:8899` means
 * something different next week. A cache that was never revalidated pinned the
 * wrong identity for that endpoint permanently — wrong program IDs, wrong
 * explorer links, wrong native symbol, with no way to clear it from the UI.
 *
 * The cache is now a fallback for the offline case instead: when the lookup
 * fails, the last hash seen from this endpoint is a better answer than none,
 * and the caller keeps rendering with the identity it had. With no cached hash
 * and no answer, the error propagates — callers treat "unresolved" as a signal
 * to wait, which is the safe direction.
 */
export const detectNetwork = async (
  connection: { getGenesisHash: () => Promise<string> },
  rpcUrl: string,
  cache: GenesisHashCache
): Promise<NetworkConfig> => {
  try {
    const hash = await connection.getGenesisHash();
    cache.write(rpcUrl, hash);
    return networkFromGenesisHash(hash) ?? getCurrentNetwork(rpcUrl);
  } catch (error) {
    const cached = cache.read(rpcUrl);
    if (!cached) throw error;
    console.warn('[network] Genesis hash lookup failed, using the last one seen here:', error);
    return networkFromGenesisHash(cached) ?? getCurrentNetwork(rpcUrl);
  }
};

/**
 * True when an error means "this account does not exist on this cluster".
 *
 * @sqds/multisig throws `Unable to find <Type> account at <address>` when
 * getAccountInfo returns null. An address that belongs to another chain
 * produces exactly this, so callers skip it quietly. Match on the message
 * rather than catching everything: transport and RPC failures must keep
 * surfacing.
 */
export const isAccountNotFoundError = (error: unknown): boolean => {
  const message =
    typeof error === 'string' ? error : error instanceof Error ? error.message : undefined;
  return message !== undefined && /^Unable to find \w+ account at /.test(message);
};
