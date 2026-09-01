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
   * Substrings that identify this network inside a hostname or an RPC URL.
   * Matched against whole URLs, so they cover our own domains as well as
   * third-party providers (QuickNode, Helius, …) whose host names carry the
   * cluster in them.
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
    markers: ['mainnet.x1.xyz', 'rpc.x1.xyz', 'multisig.x1.xyz', 'mainnet'],
  },
  {
    id: 'x1-testnet',
    name: 'X1 Testnet',
    url: 'https://multisig.testnet.x1.xyz',
    rpcUrl: 'https://rpc.testnet.x1.xyz',
    nativeSymbol: 'XNT',
    markers: ['testnet'],
  },
  {
    id: 'solana-mainnet',
    name: 'Solana Mainnet',
    url: 'https://multisig.solana-mainnet.x1.xyz',
    rpcUrl: 'https://api.mainnet-beta.solana.com',
    nativeSymbol: 'SOL',
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
