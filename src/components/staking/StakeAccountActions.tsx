import { useState } from 'react';
import { Button } from '../ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';
import { MoreHorizontal, ArrowUpDown, ArrowDown, Wallet } from 'lucide-react';
import { UndelegateStakeDialog } from './UndelegateStakeDialog';
import { WithdrawStakeDialog } from './WithdrawStakeDialog';
import { RedelegateStakeDialog } from './RedelegateStakeDialog';
import { StakeAccountInfo } from '@/lib/staking/validatorStakeUtils';

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

  const canUndelegate = account.state === 'active' || account.state === 'activating';
  const canWithdraw = account.state === 'inactive';
  const canRedelegate = account.state === 'inactive';

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
    </>
  );
}
