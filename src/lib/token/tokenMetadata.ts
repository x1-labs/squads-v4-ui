import { Connection, PublicKey } from '@solana/web3.js';
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import { fromWeb3JsPublicKey, toWeb3JsPublicKey } from '@metaplex-foundation/umi-web3js-adapters';
import {
  fetchMetadata,
  findMetadataPda,
  Metadata as MetaplexMetadata,
} from '@metaplex-foundation/mpl-token-metadata';
import { publicKey } from '@metaplex-foundation/umi';
import {
  getMint,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  ExtensionType,
  getExtensionData,
} from '@solana/spl-token';
import { unpack } from '@solana/spl-token-metadata';

export interface TokenMetadata {
  symbol?: string;
  name?: string;
  logoURI?: string;
  decimals?: number;
  address: string;
}

const metadataCache = new Map<string, TokenMetadata>();

/**
 * Determine which token program a mint belongs to
 */
async function getTokenProgram(mintAddress: PublicKey, connection: Connection): Promise<PublicKey> {
  try {
    // Try Token 2022 first
    await getMint(connection, mintAddress, 'confirmed', TOKEN_2022_PROGRAM_ID);
    return TOKEN_2022_PROGRAM_ID;
  } catch {
    // Fall back to Token Program
    return TOKEN_PROGRAM_ID;
  }
}

/**
 * Fetch Token 2022 on-chain metadata
 */
async function getToken2022OnChainMetadata(
  mintAddress: PublicKey,
  connection: Connection
): Promise<TokenMetadata | null> {
  try {
    // Get the mint account with Token 2022 program
    const mintInfo = await getMint(connection, mintAddress, 'confirmed', TOKEN_2022_PROGRAM_ID);

    // Check if the mint has metadata extension
    if (!mintInfo.tlvData || mintInfo.tlvData.length === 0) {
      return null;
    }

    // Extract metadata from the Token 2022 extension
    const metadataExtension = getExtensionData(ExtensionType.TokenMetadata, mintInfo.tlvData);
    if (!metadataExtension) return null;

    // Parse the metadata extension buffer
    const metadata = unpack(metadataExtension);
    if (!metadata) return null;

    const result: TokenMetadata = {
      address: mintAddress.toBase58(),
      name: metadata.name || undefined,
      symbol: metadata.symbol || undefined,
      logoURI: metadata.uri || undefined,
    };

    // If there's a URI, try to fetch additional metadata
    if (metadata.uri) {
      try {
        const response = await fetch(metadata.uri);
        if (response.ok) {
          const contentType = response.headers.get('content-type');

          if (contentType && contentType.includes('application/json')) {
            const jsonMetadata = await response.json();
            if (jsonMetadata.image) {
              result.logoURI = jsonMetadata.image;
            }
            // Update fields from JSON if they exist
            if (jsonMetadata.name) {
              result.name = jsonMetadata.name;
            }
            if (jsonMetadata.symbol) {
              result.symbol = jsonMetadata.symbol;
            }
          } else if (contentType && contentType.startsWith('image/')) {
            // URI points directly to an image
            result.logoURI = metadata.uri;
          }
        }
      } catch (error) {
        // Silently ignore URI fetch errors
      }
    }

    return result;
  } catch (error) {
    console.debug('Failed to fetch Token 2022 metadata for', mintAddress.toBase58(), error);
    return null;
  }
}

/**
 * Fetch token metadata supporting both Token Program and Token 2022
 */
export async function getTokenMetadata(
  mintAddress: string | PublicKey,
  connection: Connection
): Promise<TokenMetadata> {
  const address = typeof mintAddress === 'string' ? mintAddress : mintAddress.toBase58();
  const mintPublicKey = typeof mintAddress === 'string' ? new PublicKey(mintAddress) : mintAddress;

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

    // First, try Token 2022 on-chain metadata (faster and more reliable)
    const token2022Metadata = await getToken2022OnChainMetadata(mintPublicKey, connection);
    if (token2022Metadata) {
      metadataCache.set(address, token2022Metadata);
      return token2022Metadata;
    }

    // Fall back to Metaplex metadata for both Token Program and Token 2022 tokens
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
          const contentType = response.headers.get('content-type');

          // Check if the response is JSON
          if (contentType && contentType.includes('application/json')) {
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
          } else if (contentType && contentType.startsWith('image/')) {
            // If the URI points directly to an image, use it as the logo
            metadata.logoURI = metadataAccount.uri;
          }
        }
      } catch (error) {
        // Silently ignore - this is common when URIs point to images or are unreachable
      }
    }

    metadataCache.set(address, metadata);
    return metadata;
  } catch (error) {
    console.debug('Failed to fetch metadata for', address, error);

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
