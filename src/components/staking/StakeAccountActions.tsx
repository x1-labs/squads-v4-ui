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
import { StakeAccountInfo, getCompatibleMergeAccounts, createDeactivateStakeInstruction, createWithdrawStakeInstruction, createMergeStakeInstruction } from '@/lib/staking/validatorStakeUtils';
import { useBatchTransactions } from '@/hooks/useBatchTransactions';
import { useMultisigData } from '@/hooks/useMultisigData';
import { useValidatorsMetadata } from '@/hooks/useValidatorMetadata';
import { PublicKey } from '@solana/web3.js';
import * as multisig from '@sqds/multisig';
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
  const { addItem } = useBatchTransactions();
  const { multisigAddress, programId } = useMultisigData();

  const validatorAddresses = account.delegatedValidator ? [account.delegatedValidator] : [];
  const { data: validatorMetadata } = useValidatorsMetadata(validatorAddresses);

  const canUndelegate = account.state === 'active' || account.state === 'activating';
  const canWithdraw = account.state === 'inactive' || account.state === 'deactivating';
  const canRedelegate = account.state === 'inactive';
  const canSplit = account.balance > account.rentExemptReserve + 0.1; // Must have enough to split (leave 0.1 XNT minimum)
  const canMerge = getCompatibleMergeAccounts(account, allStakeAccounts).length > 0; // Must have compatible accounts to merge with
  const canBatchUnstake = canUndelegate;
  const canBatchWithdraw = canWithdraw;

  const getValidatorLabel = () => {
    if (account.delegatedValidator && validatorMetadata?.get(account.delegatedValidator)?.name) {
      return validatorMetadata.get(account.delegatedValidator)!.name!;
    }
    if (account.delegatedValidator) {
      return `${account.delegatedValidator.slice(0, 8)}...`;
    }
    return `${account.address.slice(0, 8)}...`;
  };

  const getVaultAddress = () => {
    if (!multisigAddress) return null;
    return multisig.getVaultPda({
      index: vaultIndex,
      multisigPda: new PublicKey(multisigAddress),
      programId,
    })[0];
  };

  const addUnstakeToBatch = () => {
    const vaultAddress = getVaultAddress();
    if (!vaultAddress) return;

    const instruction = createDeactivateStakeInstruction(
      new PublicKey(account.address),
      vaultAddress
    );

    addItem({
      type: 'unstake',
      label: `Unstake ${getValidatorLabel()}`,
      description: `${account.balance.toLocaleString(undefined, { maximumFractionDigits: 2 })} XNT - ${account.address.slice(0, 8)}...`,
      instructions: [instruction],
      vaultIndex,
    });

    toast.success('Added unstake to batch queue');
  };

  const addWithdrawToBatch = () => {
    const vaultAddress = getVaultAddress();
    if (!vaultAddress) return;

    const instruction = createWithdrawStakeInstruction(
      new PublicKey(account.address),
      vaultAddress,
      BigInt(account.balanceLamports)
    );

    addItem({
      type: 'withdraw',
      label: `Withdraw ${getValidatorLabel()}`,
      description: `${account.balance.toLocaleString(undefined, { maximumFractionDigits: 2 })} XNT - ${account.address.slice(0, 8)}...`,
      instructions: [instruction],
      vaultIndex,
    });

    toast.success('Added withdrawal to batch queue');
  };

  const addMergeToBatch = () => {
    const vaultAddress = getVaultAddress();
    if (!vaultAddress) return;

    const compatible = getCompatibleMergeAccounts(account, allStakeAccounts);
    if (compatible.length === 0) return;

    for (const source of compatible) {
      const instruction = createMergeStakeInstruction(
        new PublicKey(account.address),
        new PublicKey(source.address),
        vaultAddress
      );

      addItem({
        type: 'merge',
        label: `Merge into ${getValidatorLabel()}`,
        description: `${source.balance.toLocaleString(undefined, { maximumFractionDigits: 2 })} XNT from ${source.address.slice(0, 8)}...`,
        instructions: [instruction],
        vaultIndex,
      });
    }

    toast.success(`Added ${compatible.length} merge operation${compatible.length > 1 ? 's' : ''} to batch queue`);
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
          {(canBatchUnstake || canBatchWithdraw || canSplit || canMerge) && (
            <>
              <DropdownMenuSeparator />
              {canBatchUnstake && (
                <DropdownMenuItem
                  onClick={addUnstakeToBatch}
                  className="cursor-pointer"
                >
                  <Layers className="mr-2 h-4 w-4" />
                  Add Unstake to Batch
                </DropdownMenuItem>
              )}
              {canBatchWithdraw && (
                <DropdownMenuItem
                  onClick={addWithdrawToBatch}
                  className="cursor-pointer"
                >
                  <Layers className="mr-2 h-4 w-4" />
                  Add Withdraw to Batch
                </DropdownMenuItem>
              )}
              {canSplit && (
                <DropdownMenuItem
                  onClick={() => setBatchSplitOpen(true)}
                  className="cursor-pointer"
                >
                  <Layers className="mr-2 h-4 w-4" />
                  Add Split to Batch
                </DropdownMenuItem>
              )}
              {canMerge && (
                <DropdownMenuItem
                  onClick={addMergeToBatch}
                  className="cursor-pointer"
                >
                  <Layers className="mr-2 h-4 w-4" />
                  Add Merge to Batch
                </DropdownMenuItem>
              )}
            </>
          )}
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
