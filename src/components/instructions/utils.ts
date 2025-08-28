import { LAMPORTS_PER_SOL } from '@solana/web3.js';

/**
 * Format token amount with decimals
 */
export function formatTokenAmount(amount: bigint | string | number, decimals: number = 0): string {
  const amountBigInt = typeof amount === 'bigint' ? amount : BigInt(amount.toString());

  if (decimals === 0) {
    return amountBigInt.toString();
  }

  const divisor = BigInt(10 ** decimals);
  const wholePart = amountBigInt / divisor;
  const fractionalPart = amountBigInt % divisor;

  if (fractionalPart === BigInt(0)) {
    return wholePart.toString();
  }

  const fractionalStr = fractionalPart.toString().padStart(decimals, '0');
  // Remove trailing zeros
  const trimmed = fractionalStr.replace(/0+$/, '');
  return `${wholePart}.${trimmed}`;
}

/**
 * Format XNT/SOL amount from lamports
 */
export function formatXntAmount(lamports: bigint | string | number): string {
  const lamportsBigInt = typeof lamports === 'bigint' ? lamports : BigInt(lamports.toString());
  return formatTokenAmount(lamportsBigInt, 9);
}

/**
 * Truncate address for display
 */
export function truncateAddress(
  address: string,
  startChars: number = 8,
  endChars: number = 8
): string {
  if (!address || address.length <= startChars + endChars + 3) {
    return address;
  }
  return `${address.slice(0, startChars)}...${address.slice(-endChars)}`;
}

/**
 * Format large numbers with commas
 */
export function formatNumber(value: number | string): string {
  return Number(value).toLocaleString();
}
