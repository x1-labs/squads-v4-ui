import { PublicKey } from '@solana/web3.js';
import { BatchItemType } from '@/hooks/useBatchTransactions';
import {
  StakeAccountInfo,
  createDeactivateStakeInstruction,
  createWithdrawStakeInstruction,
  createMergeStakeInstruction,
  getCompatibleMergeAccounts,
} from '@/lib/staking/validatorStakeUtils';

type NewBatchItem = {
  type: BatchItemType;
  label: string;
  description: string;
  instructions: ReturnType<typeof createDeactivateStakeInstruction>[];
  vaultIndex: number;
};

/**
 * Get a human-readable label for a stake account, using validator metadata when available.
 */
export function getStakeAccountLabel(
  account: StakeAccountInfo,
  validatorMetadata?: Map<string, { name?: string }>
): string {
  if (account.delegatedValidator) {
    const name = validatorMetadata?.get(account.delegatedValidator)?.name;
    if (name) return name;
    return `${account.delegatedValidator.slice(0, 8)}...`;
  }
  return `${account.address.slice(0, 8)}...`;
}

function formatBalance(balance: number): string {
  return balance.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function shortAddress(address: string): string {
  return `${address.slice(0, 8)}...`;
}

export function buildUnstakeBatchItem(
  account: StakeAccountInfo,
  vaultAddress: PublicKey,
  vaultIndex: number,
  label: string
): NewBatchItem {
  return {
    type: 'unstake',
    label: `Unstake ${label}`,
    description: `${formatBalance(account.balance)} XNT - ${shortAddress(account.address)}`,
    instructions: [createDeactivateStakeInstruction(new PublicKey(account.address), vaultAddress)],
    vaultIndex,
  };
}

export function buildWithdrawBatchItem(
  account: StakeAccountInfo,
  vaultAddress: PublicKey,
  vaultIndex: number,
  label: string
): NewBatchItem {
  return {
    type: 'withdraw',
    label: `Withdraw ${label}`,
    description: `${formatBalance(account.balance)} XNT - ${shortAddress(account.address)}`,
    instructions: [
      createWithdrawStakeInstruction(
        new PublicKey(account.address),
        vaultAddress,
        BigInt(account.balanceLamports)
      ),
    ],
    vaultIndex,
  };
}

export function buildMergeBatchItem(
  destination: StakeAccountInfo,
  source: StakeAccountInfo,
  vaultAddress: PublicKey,
  vaultIndex: number,
  destinationLabel: string
): NewBatchItem {
  return {
    type: 'merge',
    label: `Merge into ${destinationLabel}`,
    description: `${formatBalance(source.balance)} XNT from ${shortAddress(source.address)}`,
    instructions: [
      createMergeStakeInstruction(
        new PublicKey(destination.address),
        new PublicKey(source.address),
        vaultAddress
      ),
    ],
    vaultIndex,
  };
}

/**
 * Build merge batch items for a group of selected accounts.
 * Groups by validator+state, merges smaller accounts into the largest in each group.
 */
export function buildBulkMergeBatchItems(
  selectedAccounts: StakeAccountInfo[],
  vaultAddress: PublicKey,
  vaultIndex: number,
  validatorMetadata?: Map<string, { name?: string }>
): NewBatchItem[] {
  const groups = new Map<string, StakeAccountInfo[]>();
  for (const account of selectedAccounts) {
    const key = `${account.delegatedValidator || 'none'}-${account.state}`;
    const group = groups.get(key) || [];
    group.push(account);
    groups.set(key, group);
  }

  const items: NewBatchItem[] = [];
  for (const group of groups.values()) {
    if (group.length < 2) continue;

    const sorted = [...group].sort((a, b) => b.balance - a.balance);
    const destination = sorted[0];
    const destLabel = getStakeAccountLabel(destination, validatorMetadata);

    for (let i = 1; i < sorted.length; i++) {
      const source = sorted[i];
      const compatible = getCompatibleMergeAccounts(destination, [source]);
      if (compatible.length === 0) continue;
      items.push(buildMergeBatchItem(destination, source, vaultAddress, vaultIndex, destLabel));
    }
  }

  return items;
}

/**
 * Count how many merge operations would result from a set of selected accounts.
 */
export function countMergeEligible(accounts: StakeAccountInfo[]): number {
  if (accounts.length < 2) return 0;
  const groups = new Map<string, number>();
  for (const a of accounts) {
    const key = `${a.delegatedValidator || 'none'}-${a.state}`;
    groups.set(key, (groups.get(key) || 0) + 1);
  }
  let count = 0;
  for (const size of groups.values()) {
    if (size >= 2) count += size - 1;
  }
  return count;
}
