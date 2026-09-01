import { NativeSymbol } from '@/lib/network';

/**
 * Number of decimals in the native token. Identical on X1 and Solana — both
 * split the native unit into 1,000,000,000 lamports — so only the ticker
 * printed alongside an amount is chain-dependent.
 */
const NATIVE_DECIMALS = 9;

/**
 * Format lamports as an amount of the chain's native token.
 *
 * The symbol is passed in rather than baked in: the same bundle serves X1
 * (XNT) and Solana (SOL). Components read it from `useNativeSymbol()`.
 */
export function formatNativeAmount(
  lamports: bigint | number | string | undefined | null,
  symbol: NativeSymbol
): string {
  if (lamports === undefined || lamports === null) {
    return `0 ${symbol}`;
  }

  const lamportsBigInt = typeof lamports === 'bigint' ? lamports : BigInt(lamports.toString());
  const divisor = BigInt(10 ** NATIVE_DECIMALS);

  const wholePart = lamportsBigInt / divisor;
  const fractionalPart = lamportsBigInt % divisor;

  // Format fractional part with leading zeros
  const fractionalStr = fractionalPart.toString().padStart(NATIVE_DECIMALS, '0');

  // Remove trailing zeros and decimal point if not needed
  const trimmedFractional = fractionalStr.replace(/0+$/, '');

  if (trimmedFractional === '') {
    return `${wholePart.toLocaleString()} ${symbol}`;
  }

  // Limit to 2 decimal places
  const limitedFractional = trimmedFractional.substring(0, 2);

  return `${wholePart.toLocaleString()}.${limitedFractional} ${symbol}`;
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
 * Format the native token with abbreviated units for large amounts.
 */
export function formatNativeAmountCompact(
  lamports: bigint | number | string | undefined | null,
  symbol: NativeSymbol
): string {
  if (lamports === undefined || lamports === null) {
    return `0 ${symbol}`;
  }

  // Handle decimal numbers by rounding them first
  const lamportsBigInt =
    typeof lamports === 'bigint' ? lamports : BigInt(Math.round(Number(lamports)));

  // Convert lamports to whole native units
  const value = Number(lamportsBigInt) / 10 ** NATIVE_DECIMALS;

  if (value < 1000) {
    return `${value.toFixed(2)} ${symbol}`;
  } else if (value < 1000000) {
    return `${(value / 1000).toFixed(2)}K ${symbol}`;
  } else if (value < 1000000000) {
    return `${(value / 1000000).toFixed(2)}M ${symbol}`;
  } else {
    return `${(value / 1000000000).toFixed(2)}B ${symbol}`;
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
