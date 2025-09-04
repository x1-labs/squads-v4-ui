import { Connection } from '@solana/web3.js';
import { SimpleDecoder } from './simpleDecoder';

// Cache for decoder instances per connection endpoint
const decoderCache = new Map<string, SimpleDecoder>();

/**
 * Get or create a SimpleDecoder instance for the given connection.
 * This prevents multiple decoder instantiations which cause repeated IDL parsing.
 */
export function getDecoderInstance(connection: Connection): SimpleDecoder {
  const endpoint = connection.rpcEndpoint;
  
  let decoder = decoderCache.get(endpoint);
  if (!decoder) {
    decoder = new SimpleDecoder(connection);
    decoderCache.set(endpoint, decoder);
  }
  
  return decoder;
}

/**
 * Clear the decoder cache (useful for testing or when switching RPC endpoints)
 */
export function clearDecoderCache(): void {
  decoderCache.clear();
}