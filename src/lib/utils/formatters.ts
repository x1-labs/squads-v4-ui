/**
 * Format lamports to XNT with proper decimal places
 * 1 XNT = 1,000,000,000 lamports (9 decimals)
 */
export function formatXNT(lamports: bigint | number | string | undefined | null): string {
  if (lamports === undefined || lamports === null) {
    return '0 XNT';
  }

  const lamportsBigInt = typeof lamports === 'bigint' ? lamports : BigInt(lamports.toString());
  const XNT_DECIMALS = 9;
  const divisor = BigInt(10 ** XNT_DECIMALS);

  const wholePart = lamportsBigInt / divisor;
  const fractionalPart = lamportsBigInt % divisor;

  // Format fractional part with leading zeros
  const fractionalStr = fractionalPart.toString().padStart(XNT_DECIMALS, '0');

  // Remove trailing zeros and decimal point if not needed
  const trimmedFractional = fractionalStr.replace(/0+$/, '');

  if (trimmedFractional === '') {
    return `${wholePart.toLocaleString()} XNT`;
  }

  return `${wholePart.toLocaleString()}.${trimmedFractional} XNT`;
}

/**
 * Format token amount with decimals
 */
export function formatTokenAmount(
  amount: bigint | number | string,
  decimals: number,
  symbol?: string
): string {
  const amountBigInt = typeof amount === 'bigint' ? amount : BigInt(amount.toString());

  if (decimals === 0) {
    return symbol ? `${amountBigInt.toLocaleString()} ${symbol}` : amountBigInt.toLocaleString();
  }

  const divisor = BigInt(10 ** decimals);
  const wholePart = amountBigInt / divisor;
  const fractionalPart = amountBigInt % divisor;

  // Format fractional part with leading zeros
  const fractionalStr = fractionalPart.toString().padStart(decimals, '0');

  // Remove trailing zeros
  const trimmedFractional = fractionalStr.replace(/0+$/, '');

  if (trimmedFractional === '') {
    const result = wholePart.toLocaleString();
    return symbol ? `${result} ${symbol}` : result;
  }

  const result = `${wholePart.toLocaleString()}.${trimmedFractional}`;
  return symbol ? `${result} ${symbol}` : result;
}

/**
 * Shorten a public key for display
 */
export function shortenAddress(address: string, chars = 4): string {
  if (!address || address.length <= chars * 2 + 3) return address;
  return `${address.slice(0, chars)}...${address.slice(-chars)}`;
}
