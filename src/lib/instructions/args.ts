import { PublicKey } from '@solana/web3.js';
import type { DecodedInstruction } from '../transaction/simpleDecoder';

/**
 * Look up an instruction account by its IDL name, falling back to a positional
 * index so a summary still renders if the bundled IDL drifts from the program.
 */
export function accountByName(
  instruction: DecodedInstruction,
  name: string,
  fallbackIndex?: number
): string | undefined {
  const match = instruction.accounts?.find((account) => account.name === name);
  if (match) return match.pubkey;
  if (fallbackIndex !== undefined) return instruction.accounts?.[fallbackIndex]?.pubkey;
  return undefined;
}

/**
 * Read a decoded pubkey (PublicKey, base58 string or byte array) as base58.
 * Returns undefined when the value is absent or not a valid key.
 */
export function readPubkeyArg(value: unknown): string | undefined {
  if (!value) return undefined;
  if (value instanceof PublicKey) return value.toBase58();
  if (typeof value === 'string') return value;
  try {
    return new PublicKey(value as any).toBase58();
  } catch {
    return undefined;
  }
}
