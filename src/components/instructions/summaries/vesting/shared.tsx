import React from 'react';
import { PublicKey } from '@solana/web3.js';
import { formatNativeAmount } from '@/lib/utils/formatters';
import { NativeSymbol } from '@/lib/network';
import { formatExactNative, toBigInt } from '@/lib/vesting/values';
import { Field } from '../shared';

export * from '../shared';

/** Read a decoded pubkey arg (PublicKey, base58 string or bytes) as base58. */
export function readPubkey(value: unknown): string | undefined {
  if (!value) return undefined;
  if (value instanceof PublicKey) return value.toBase58();
  if (typeof value === 'string') return value;
  try {
    return new PublicKey(value as any).toBase58();
  } catch {
    return undefined;
  }
}

/**
 * A native amount shown rounded for reading, with the exact figure and raw
 * lamports underneath — the precise value is what a signer is approving.
 */
export const NativeAmountField: React.FC<{
  label: string;
  lamports: unknown;
  symbol: NativeSymbol;
  hint?: string;
  tone?: React.ComponentProps<typeof Field>['tone'];
}> = ({ label, lamports, symbol, hint, tone }) => {
  const raw = toBigInt(lamports);
  if (raw === null) return <Field label={label} value="—" />;
  const exact = formatExactNative(raw, symbol);
  const rounded = formatNativeAmount(raw, symbol);
  const detail = `${exact === rounded ? '' : `${exact} · `}${raw.toLocaleString('en-US')} lamports`;
  return (
    <Field label={label} value={rounded} tone={tone} hint={hint ? `${detail}. ${hint}` : detail} />
  );
};
