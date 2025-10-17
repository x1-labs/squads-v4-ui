import { useState } from 'react';
import { Button } from '../ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';
import { MoreHorizontal, ArrowUpDown, ArrowDown, Wallet, Split, Merge } from 'lucide-react';
import { UndelegateStakeDialog } from './UndelegateStakeDialog';
import { WithdrawStakeDialog } from './WithdrawStakeDialog';
import { RedelegateStakeDialog } from './RedelegateStakeDialog';
import { SplitStakeDialog } from './SplitStakeDialog';
import { MergeStakeDialog } from './MergeStakeDialog';
import { StakeAccountInfo, getCompatibleMergeAccounts } from '@/lib/staking/validatorStakeUtils';

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

  const canUndelegate = account.state === 'active' || account.state === 'activating';
  const canWithdraw = account.state === 'inactive';
  const canRedelegate = account.state === 'inactive';
  const canSplit = account.balance > account.rentExemptReserve + 0.1; // Must have enough to split (leave 0.1 XNT minimum)
  const canMerge = getCompatibleMergeAccounts(account, allStakeAccounts).length > 0; // Must have compatible accounts to merge with

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
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Only render the dialog that's currently open to avoid focus conflicts */}
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
    </>
  );
}
