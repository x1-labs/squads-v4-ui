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

/**
 * Format large numbers with K, M, B suffixes
 */
export function formatLargeNumber(value: number, decimals: number = 2): string {
  if (value < 1000) {
    return value.toFixed(decimals);
  } else if (value < 1000000) {
    return `${(value / 1000).toFixed(decimals)}K`;
  } else if (value < 1000000000) {
    return `${(value / 1000000).toFixed(decimals)}M`;
  } else {
    return `${(value / 1000000000).toFixed(decimals)}B`;
  }
}

/**
 * Format XNT with abbreviated units for large amounts
 */
export function formatXNTCompact(lamports: bigint | number | string | undefined | null): string {
  if (lamports === undefined || lamports === null) {
    return '0 XNT';
  }

  // Handle decimal numbers by rounding them first
  const lamportsBigInt = typeof lamports === 'bigint' 
    ? lamports 
    : BigInt(Math.round(Number(lamports)));
  const XNT_DECIMALS = 9;

  // Convert to XNT as a number
  const xntValue = Number(lamportsBigInt) / 10 ** XNT_DECIMALS;

  if (xntValue < 1000) {
    return `${xntValue.toFixed(2)} XNT`;
  } else if (xntValue < 1000000) {
    return `${(xntValue / 1000).toFixed(2)}K XNT`;
  } else if (xntValue < 1000000000) {
    return `${(xntValue / 1000000).toFixed(2)}M XNT`;
  } else {
    return `${(xntValue / 1000000000).toFixed(2)}B XNT`;
  }
}

/**
 * Format instruction argument values for display
 */
export function formatInstructionValue(value: any, key?: string): string {
  if (value === null || value === undefined) return 'null';

  // Handle BN (BigNumber) objects from Anchor
  if (typeof value === 'object' && value.constructor && value.constructor.name === 'BN') {
    const decimalStr = value.toString(10);
    // Add thousand separators
    const num = BigInt(decimalStr);
    return num.toLocaleString();
  }

  // Handle hex strings that might represent numbers
  if (typeof value === 'object' && value.hex) {
    try {
      const num = BigInt('0x' + value.hex);
      return num.toLocaleString();
    } catch {
      return value.hex;
    }
  }

  if (typeof value === 'object') {
    if (Array.isArray(value)) {
      // Special handling for actions array in config transactions
      if (key === 'actions') {
        return JSON.stringify(value, null, 2);
      }
      // For other arrays, show a summary if small, otherwise just count
      if (value.length <= 3) {
        return JSON.stringify(value, null, 2);
      }
      return `[${value.length} items]\n${JSON.stringify(value, null, 2)}`;
    }

    // Check if the object has a toString method that isn't the default Object.toString
    if (value.toString && value.toString !== Object.prototype.toString) {
      const str = value.toString();
      // If it looks like a number string, format it
      if (/^\d+$/.test(str)) {
        const num = BigInt(str);
        return num.toLocaleString();
      }
      return str;
    }

    return JSON.stringify(value, null, 2);
  }

  // Handle regular numbers
  if (typeof value === 'number') {
    return value.toLocaleString();
  }

  return String(value);
}
