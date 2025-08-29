import { Connection, PublicKey } from '@solana/web3.js';
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import { fromWeb3JsPublicKey, toWeb3JsPublicKey } from '@metaplex-foundation/umi-web3js-adapters';
import {
  fetchMetadata,
  findMetadataPda,
  Metadata as MetaplexMetadata,
} from '@metaplex-foundation/mpl-token-metadata';
import { publicKey } from '@metaplex-foundation/umi';

export interface TokenMetadata {
  symbol?: string;
  name?: string;
  logoURI?: string;
  decimals?: number;
  address: string;
}

const metadataCache = new Map<string, TokenMetadata>();

/**
 * Fetch token metadata from on-chain Metaplex metadata account
 */
export async function getTokenMetadata(
  mintAddress: string | PublicKey,
  connection: Connection
): Promise<TokenMetadata> {
  const address = typeof mintAddress === 'string' ? mintAddress : mintAddress.toBase58();

  if (metadataCache.has(address)) {
    return metadataCache.get(address)!;
  }

  try {
    // Always prefer the RPC URL from localStorage over the connection's endpoint
    // because the wallet adapter connection might have a different RPC
    const rpcUrl =
      typeof window !== 'undefined' && localStorage.getItem('x-rpc-url')
        ? localStorage.getItem('x-rpc-url')!
        : connection.rpcEndpoint;

    const umi = createUmi(rpcUrl);
    const mint = publicKey(address);
    const metadataPda = findMetadataPda(umi, { mint });
    const metadataAccount = await fetchMetadata(umi, metadataPda);

    const metadata: TokenMetadata = {
      address,
      name: metadataAccount.name || undefined,
      symbol: metadataAccount.symbol || undefined,
      logoURI: metadataAccount.uri || undefined,
    };

    if (metadataAccount.uri) {
      try {
        // For localnet, we might not be able to fetch external URIs
        // but we'll try anyway in case it's pointing to a local server
        const response = await fetch(metadataAccount.uri);
        if (response.ok) {
          const jsonMetadata = await response.json();
          if (jsonMetadata.image) {
            metadata.logoURI = jsonMetadata.image;
          }
          // Update name and symbol if they exist in JSON
          if (jsonMetadata.name) {
            metadata.name = jsonMetadata.name;
          }
          if (jsonMetadata.symbol) {
            metadata.symbol = jsonMetadata.symbol;
          }
        }
      } catch (error) {
        console.debug('Could not fetch off-chain metadata:', error);
      }
    }

    metadataCache.set(address, metadata);
    return metadata;
  } catch (error) {
    console.debug('Failed to fetch on-chain metadata for', address, error);

    const fallbackMetadata: TokenMetadata = {
      address,
      symbol: address.slice(0, 4) + '...',
      name: 'Unknown Token',
    };

    metadataCache.set(address, fallbackMetadata);
    return fallbackMetadata;
  }
}

/**
 * Batch fetch token metadata
 */
export async function getMultipleTokenMetadata(
  mintAddresses: (string | PublicKey)[],
  connection: Connection
): Promise<Map<string, TokenMetadata>> {
  const results = new Map<string, TokenMetadata>();

  const promises = mintAddresses.map(async (mint) => {
    const address = typeof mint === 'string' ? mint : mint.toBase58();
    const metadata = await getTokenMetadata(mint, connection);
    results.set(address, metadata);
  });

  await Promise.all(promises);
  return results;
}

/**
 * Clear metadata cache
 */
export function clearMetadataCache(): void {
  metadataCache.clear();
}
