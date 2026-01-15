import { Connection, PublicKey } from '@solana/web3.js';
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import { safeFetchMetadata, findMetadataPda } from '@metaplex-foundation/mpl-token-metadata';
import { publicKey } from '@metaplex-foundation/umi';
import {
  getMint,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  ExtensionType,
  getExtensionData,
  Mint,
} from '@solana/spl-token';
import { unpack } from '@solana/spl-token-metadata';

export interface TokenMetadata {
  symbol?: string;
  name?: string;
  logoURI?: string;
  decimals?: number;
  address: string;
}

interface MintWithProgram {
  mintInfo: Mint;
  programId: PublicKey;
}

const metadataCache = new Map<string, TokenMetadata>();

/**
 * Determine which token program a mint belongs to and return the mint info
 */
async function getMintWithProgram(
  mintAddress: PublicKey,
  connection: Connection
): Promise<MintWithProgram | null> {
  // First, get the account info to check the owner (single RPC call)
  const accountInfo = await connection.getAccountInfo(mintAddress, 'confirmed');
  if (!accountInfo) {
    return null;
  }

  // Determine the program based on the account owner
  let programId: PublicKey;
  if (accountInfo.owner.equals(TOKEN_2022_PROGRAM_ID)) {
    programId = TOKEN_2022_PROGRAM_ID;
  } else if (accountInfo.owner.equals(TOKEN_PROGRAM_ID)) {
    programId = TOKEN_PROGRAM_ID;
  } else {
    // Not a token mint
    return null;
  }

  // Now fetch the mint data with the correct program
  try {
    const mintInfo = await getMint(connection, mintAddress, 'confirmed', programId);
    return { mintInfo, programId };
  } catch {
    return null;
  }
}

/**
 * Extract Token 2022 on-chain metadata from mint info
 */
function extractToken2022Metadata(
  mintAddress: PublicKey,
  mintInfo: Mint
): TokenMetadata | null {
  try {
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

    return {
      address: mintAddress.toBase58(),
      name: metadata.name || undefined,
      symbol: metadata.symbol || undefined,
      logoURI: metadata.uri || undefined,
    };
  } catch {
    return null;
  }
}

/**
 * Fetch additional metadata from URI (for both Token 2022 and Metaplex)
 */
async function fetchUriMetadata(
  baseMetadata: TokenMetadata,
  uri: string
): Promise<TokenMetadata> {
  try {
    const response = await fetch(uri);
    if (response.ok) {
      const contentType = response.headers.get('content-type');

      if (contentType && contentType.includes('application/json')) {
        const jsonMetadata = await response.json();
        if (jsonMetadata.image) {
          baseMetadata.logoURI = jsonMetadata.image;
        }
        if (jsonMetadata.name) {
          baseMetadata.name = jsonMetadata.name;
        }
        if (jsonMetadata.symbol) {
          baseMetadata.symbol = jsonMetadata.symbol;
        }
      } else if (contentType && contentType.startsWith('image/')) {
        baseMetadata.logoURI = uri;
      }
    }
  } catch {
    // Silently ignore URI fetch errors
  }
  return baseMetadata;
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

    // First, determine which token program owns this mint
    const mintWithProgram = await getMintWithProgram(mintPublicKey, connection);

    // If it's a Token 2022 token, try to get on-chain metadata first
    if (mintWithProgram && mintWithProgram.programId.equals(TOKEN_2022_PROGRAM_ID)) {
      const token2022Metadata = extractToken2022Metadata(mintPublicKey, mintWithProgram.mintInfo);
      if (token2022Metadata) {
        // Fetch additional metadata from URI if available
        if (token2022Metadata.logoURI) {
          await fetchUriMetadata(token2022Metadata, token2022Metadata.logoURI);
        }
        metadataCache.set(address, token2022Metadata);
        return token2022Metadata;
      }
    }

    // Fall back to Metaplex metadata for both Token Program and Token 2022 tokens
    const umi = createUmi(rpcUrl);
    const mint = publicKey(address);
    const metadataPda = findMetadataPda(umi, { mint });
    const metadataAccount = await safeFetchMetadata(umi, metadataPda);

    // If no Metaplex metadata exists, return fallback
    if (!metadataAccount) {
      const fallbackMetadata: TokenMetadata = {
        address,
        symbol: address.slice(0, 4) + '...',
        name: 'Unknown Token',
      };
      metadataCache.set(address, fallbackMetadata);
      return fallbackMetadata;
    }

    let metadata: TokenMetadata = {
      address,
      name: metadataAccount.name || undefined,
      symbol: metadataAccount.symbol || undefined,
      logoURI: metadataAccount.uri || undefined,
    };

    if (metadataAccount.uri) {
      metadata = await fetchUriMetadata(metadata, metadataAccount.uri);
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
