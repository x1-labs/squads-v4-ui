import { useState } from 'react';
import { Button } from '../ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';
import { MoreHorizontal, ArrowUpDown, ArrowDown, Wallet, Split, Merge, Layers } from 'lucide-react';
import { UndelegateStakeDialog } from './UndelegateStakeDialog';
import { WithdrawStakeDialog } from './WithdrawStakeDialog';
import { RedelegateStakeDialog } from './RedelegateStakeDialog';
import { SplitStakeDialog } from './SplitStakeDialog';
import { MergeStakeDialog } from './MergeStakeDialog';
import { BatchSplitDialog } from './BatchSplitDialog';
import { StakeAccountInfo, getCompatibleMergeAccounts } from '@/lib/staking/validatorStakeUtils';
import {
  getStakeAccountLabel,
  buildUnstakeBatchItem,
  buildWithdrawBatchItem,
  buildMergeBatchItem,
} from '@/lib/staking/batchStakeActions';
import { useBatchTransactions } from '@/hooks/useBatchTransactions';
import { useMultisigData } from '@/hooks/useMultisigData';
import { useValidatorsMetadata } from '@/hooks/useValidatorMetadata';
import { toast } from 'sonner';

type StakeAccountActionsProps = {
  account: StakeAccountInfo;
  vaultIndex: number;
  allStakeAccounts: StakeAccountInfo[];
};

export function StakeAccountActions({
  account,
  vaultIndex,
  allStakeAccounts,
}: StakeAccountActionsProps) {
  const [undelegateOpen, setUndelegateOpen] = useState(false);
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [redelegateOpen, setRedelegateOpen] = useState(false);
  const [splitOpen, setSplitOpen] = useState(false);
  const [mergeOpen, setMergeOpen] = useState(false);
  const [batchSplitOpen, setBatchSplitOpen] = useState(false);
  const { addItem, isFull } = useBatchTransactions();
  const { multisigVault } = useMultisigData();

  const validatorAddresses = account.delegatedValidator ? [account.delegatedValidator] : [];
  const { data: validatorMetadata } = useValidatorsMetadata(validatorAddresses);

  const canUndelegate = account.state === 'active' || account.state === 'activating';
  const canWithdraw = account.state === 'inactive' || account.state === 'deactivating';
  const canRedelegate = account.state === 'inactive';
  const canSplit = account.balance > account.rentExemptReserve + 0.1;
  const canMerge = getCompatibleMergeAccounts(account, allStakeAccounts).length > 0;

  const label = getStakeAccountLabel(account, validatorMetadata);

  const addUnstakeToBatch = () => {
    if (!multisigVault) return;
    const added = addItem(buildUnstakeBatchItem(account, multisigVault, vaultIndex, label));
    if (added) {
      toast.success('Added unstake to batch queue');
    } else {
      toast.error('Batch queue is full');
    }
  };

  const addWithdrawToBatch = () => {
    if (!multisigVault) return;
    const added = addItem(buildWithdrawBatchItem(account, multisigVault, vaultIndex, label));
    if (added) {
      toast.success('Added withdrawal to batch queue');
    } else {
      toast.error('Batch queue is full');
    }
  };

  const addMergeToBatch = () => {
    if (!multisigVault) return;
    const compatible = getCompatibleMergeAccounts(account, allStakeAccounts);
    if (compatible.length === 0) return;

    let count = 0;
    for (const source of compatible) {
      const added = addItem(buildMergeBatchItem(account, source, multisigVault, vaultIndex, label));
      if (added) count++;
      else break;
    }
    if (count === 0) {
      toast.error('Batch queue is full');
    } else if (count < compatible.length) {
      toast.warning(`Added ${count} of ${compatible.length} merge operations (batch limit reached)`);
    } else {
      toast.success(
        `Added ${count} merge operation${count > 1 ? 's' : ''} to batch queue`
      );
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
            <MoreHorizontal className="h-4 w-4" />
            <span className="sr-only">Open actions menu</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem
            onClick={() => setRedelegateOpen(true)}
            disabled={!canRedelegate}
            className="cursor-pointer"
          >
            <ArrowUpDown className="mr-2 h-4 w-4" />
            Restake
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => setUndelegateOpen(true)}
            disabled={!canUndelegate}
            className="cursor-pointer"
          >
            <ArrowDown className="mr-2 h-4 w-4" />
            Unstake
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => setSplitOpen(true)}
            disabled={!canSplit}
            className="cursor-pointer"
          >
            <Split className="mr-2 h-4 w-4" />
            Split
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => setMergeOpen(true)}
            disabled={!canMerge}
            className="cursor-pointer"
          >
            <Merge className="mr-2 h-4 w-4" />
            Merge
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => setWithdrawOpen(true)}
            disabled={!canWithdraw}
            className="cursor-pointer"
          >
            <Wallet className="mr-2 h-4 w-4" />
            Withdraw
          </DropdownMenuItem>

          {/* Batch actions */}
          {(canUndelegate || canWithdraw || canSplit || canMerge) && (
            <>
              <DropdownMenuSeparator />
              {canUndelegate && (
                <DropdownMenuItem onClick={addUnstakeToBatch} disabled={isFull} className="cursor-pointer">
                  <Layers className="mr-2 h-4 w-4" />
                  Add Unstake to Batch
                </DropdownMenuItem>
              )}
              {canWithdraw && (
                <DropdownMenuItem onClick={addWithdrawToBatch} disabled={isFull} className="cursor-pointer">
                  <Layers className="mr-2 h-4 w-4" />
                  Add Withdraw to Batch
                </DropdownMenuItem>
              )}
              {canSplit && (
                <DropdownMenuItem
                  onClick={() => setBatchSplitOpen(true)}
                  disabled={isFull}
                  className="cursor-pointer"
                >
                  <Layers className="mr-2 h-4 w-4" />
                  Add Split to Batch
                </DropdownMenuItem>
              )}
              {canMerge && (
                <DropdownMenuItem onClick={addMergeToBatch} disabled={isFull} className="cursor-pointer">
                  <Layers className="mr-2 h-4 w-4" />
                  Add Merge to Batch
                </DropdownMenuItem>
              )}
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {undelegateOpen && (
        <UndelegateStakeDialog
          stakeAccounts={[account]}
          vaultIndex={vaultIndex}
          isOpen={undelegateOpen}
          onOpenChange={setUndelegateOpen}
          preSelectedAccount={account}
        />
      )}

      {withdrawOpen && (
        <WithdrawStakeDialog
          stakeAccounts={[account]}
          vaultIndex={vaultIndex}
          isOpen={withdrawOpen}
          onOpenChange={setWithdrawOpen}
          preSelectedAccount={account}
        />
      )}

      {redelegateOpen && (
        <RedelegateStakeDialog
          stakeAccounts={allStakeAccounts}
          vaultIndex={vaultIndex}
          isOpen={redelegateOpen}
          onOpenChange={setRedelegateOpen}
          preSelectedAccount={account}
        />
      )}

      {splitOpen && (
        <SplitStakeDialog
          vaultIndex={vaultIndex}
          isOpen={splitOpen}
          onOpenChange={setSplitOpen}
          preSelectedAccount={account}
        />
      )}

      {mergeOpen && (
        <MergeStakeDialog
          vaultIndex={vaultIndex}
          isOpen={mergeOpen}
          onOpenChange={setMergeOpen}
          preSelectedAccount={account}
          allStakeAccounts={allStakeAccounts}
        />
      )}

      {batchSplitOpen && (
        <BatchSplitDialog
          vaultIndex={vaultIndex}
          isOpen={batchSplitOpen}
          onOpenChange={setBatchSplitOpen}
          preSelectedAccount={account}
        />
      )}
    </>
  );
}
