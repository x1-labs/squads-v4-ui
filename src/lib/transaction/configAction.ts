import type { NativeSymbol } from '../network';
import { formatDuration } from '../timeLock';

/** A spending limit with this mint is for the native token. See the `mint` doc in the program IDL. */
export const NATIVE_MINT_ADDRESS = '11111111111111111111111111111111';

/** Number of decimals in the native token. It is 9 on X1 and on Solana. */
const NATIVE_DECIMALS = 9;

/** Names of the SDK `Period` enum values, by index. */
const PERIOD_NAMES = ['One time', 'Day', 'Week', 'Month'];

/** Base58 string of a public key, or undefined when the value is not a public key. */
function toAddress(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  if (value && typeof (value as any).toBase58 === 'function') return (value as any).toBase58();
  return undefined;
}

/** A u64 as a bigint, or undefined when the value is not a whole number of zero or more. */
function toBigInt(value: unknown): bigint | undefined {
  if (typeof value === 'bigint') return value;
  if (typeof value === 'number') {
    return Number.isSafeInteger(value) && value >= 0 ? BigInt(value) : undefined;
  }
  if (typeof value === 'string') return /^\d+$/.test(value) ? BigInt(value) : undefined;
  // BN from the SDK. Use duck typing: the app and the SDK can load different copies of bn.js.
  if (value && typeof (value as any).toString === 'function' && 'words' in (value as any)) {
    const str = (value as any).toString(10);
    return /^\d+$/.test(str) ? BigInt(str) : undefined;
  }
  return undefined;
}

/** Exact decimal string of `amount / 10^decimals`, with no rounding and no locale separators. */
export function formatUnits(amount: bigint, decimals: number): string {
  const divisor = 10n ** BigInt(decimals);
  const fraction = (amount % divisor).toString().padStart(decimals, '0').replace(/0+$/, '');
  return fraction ? `${amount / divisor}.${fraction}` : `${amount / divisor}`;
}

/**
 * Copy of `value` that `JSON.stringify` can show. The decoder output is shown
 * with `JSON.stringify`, which throws on a bigint and shows a BN as hex.
 */
function toDisplayValue(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === 'bigint') return value.toString();
  if (typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(toDisplayValue);
  const address = toAddress(value);
  if (address !== undefined) return address;
  const big = toBigInt(value);
  if (big !== undefined) return big.toString();
  return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, toDisplayValue(v)]));
}

/** Output for an action whose fields do not match the SDK type. */
function unexpectedFields(type: string, action: unknown) {
  return {
    type,
    error: 'Unexpected action fields. Showing the raw data.',
    rawData: toDisplayValue(action),
  };
}

/**
 * Decode one `ConfigAction` from a `ConfigTransaction` account for display.
 * Field names come from the SDK type (generated/types/ConfigAction.d.ts).
 */
export function decodeConfigAction(action: any, nativeSymbol?: NativeSymbol): any {
  if (!action || typeof action !== 'object') {
    return { type: 'Unknown', data: action };
  }

  // The action structure in Anchor uses __kind for the discriminator
  const actionType = action.__kind || action.kind;

  // If we can't find the action type, show the raw data
  if (!actionType) {
    console.log('Unknown action structure:', action);
    return {
      type: 'Unknown Action',
      rawData: toDisplayValue(action),
    };
  }

  switch (actionType) {
    case 'AddMember':
    case 'addMember':
      const newMemberKey = action.newMember?.key;
      return {
        type: 'Add Member',
        member: newMemberKey
          ? typeof newMemberKey.toBase58 === 'function'
            ? newMemberKey.toBase58()
            : newMemberKey.toString()
          : 'Unknown',
        permissions: {
          mask: action.newMember?.permissions?.mask || 0,
          ...(action.newMember?.permissions || {}),
        },
      };

    case 'RemoveMember':
    case 'removeMember':
      const oldMemberKey = action.oldMember;
      return {
        type: 'Remove Member',
        member: oldMemberKey
          ? typeof oldMemberKey.toBase58 === 'function'
            ? oldMemberKey.toBase58()
            : oldMemberKey.toString()
          : 'Unknown',
      };

    case 'ChangeThreshold':
    case 'changeThreshold':
      return {
        type: 'Change Threshold',
        newThreshold: action.newThreshold || 0,
      };

    case 'SetTimeLock':
    case 'setTimeLock': {
      const seconds = action.newTimeLock;
      if (!Number.isSafeInteger(seconds) || seconds < 0) {
        return unexpectedFields('Set Time Lock', action);
      }
      return {
        type: 'Set Time Lock',
        newTimeLock: `${formatDuration(seconds)} (${seconds} seconds)`,
      };
    }

    case 'AddSpendingLimit':
    case 'addSpendingLimit': {
      const createKey = toAddress(action.createKey);
      const mint = toAddress(action.mint);
      const amount = toBigInt(action.amount);
      const period = PERIOD_NAMES[action.period];
      const members = Array.isArray(action.members) ? action.members.map(toAddress) : undefined;
      const destinations = Array.isArray(action.destinations)
        ? action.destinations.map(toAddress)
        : undefined;
      if (
        createKey === undefined ||
        !Number.isInteger(action.vaultIndex) ||
        mint === undefined ||
        amount === undefined ||
        !Number.isInteger(action.period) ||
        period === undefined ||
        members === undefined ||
        members.includes(undefined) ||
        destinations === undefined ||
        destinations.includes(undefined)
      ) {
        return unexpectedFields('Add Spending Limit', action);
      }

      const isNative = mint === NATIVE_MINT_ADDRESS;
      return {
        type: 'Add Spending Limit',
        vaultIndex: action.vaultIndex,
        mint: isNative ? `${NATIVE_MINT_ADDRESS} (native ${nativeSymbol ?? 'token'})` : mint,
        // The decoder does not fetch the mint, so an SPL amount stays in base units.
        ...(isNative
          ? { amount: `${formatUnits(amount, NATIVE_DECIMALS)} ${nativeSymbol ?? ''}`.trim() }
          : {}),
        amountBaseUnits: amount.toString(),
        period,
        members,
        destinations: destinations.length === 0 ? 'Any address' : destinations,
        createKey,
      };
    }

    case 'RemoveSpendingLimit':
    case 'removeSpendingLimit': {
      const spendingLimitKey = toAddress(action.spendingLimit);
      if (spendingLimitKey === undefined) {
        return unexpectedFields('Remove Spending Limit', action);
      }
      return { type: 'Remove Spending Limit', spendingLimitKey };
    }

    default:
      // For unknown action types, show all the data
      return {
        type: actionType || 'Unknown Action',
        data: toDisplayValue({ ...action, __kind: undefined, kind: undefined }),
      };
  }
}
