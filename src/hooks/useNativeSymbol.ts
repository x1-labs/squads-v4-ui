import { getNativeSymbol, NativeSymbol } from '@/lib/network';
import { useRpcUrl } from './useSettings';

/**
 * Ticker for the connected chain's native token: SOL on Solana Mainnet, XNT on
 * X1. Synchronous by design — it derives from the RPC URL already in cache, so
 * labels never flash a placeholder and no extra query joins the render path.
 */
export const useNativeSymbol = (): NativeSymbol => getNativeSymbol(useRpcUrl().rpcUrl);
