import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useState } from 'react';
import { LAMPORTS_PER_SOL, PublicKey } from '@solana/web3.js';
import { toast } from 'sonner';
import { useMultisigData } from '@/hooks/useMultisigData';
import { useBatchTransactions } from '@/hooks/useBatchTransactions';
import { useValidatorsMetadata } from '@/hooks/useValidatorMetadata';
import { createSplitStakeInstructions, StakeAccountInfo } from '@/lib/staking/validatorStakeUtils';
import { getStakeAccountLabel } from '@/lib/staking/batchStakeActions';
import { formatXNTCompact } from '@/lib/utils/formatters';
import { AlertCircle, Layers } from 'lucide-react';
import { StakeAccountDisplay } from './StakeAccountDisplay';

type BatchSplitDialogProps = {
  vaultIndex?: number;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  preSelectedAccount: StakeAccountInfo;
};

export function BatchSplitDialog({
  vaultIndex = 0,
  isOpen,
  onOpenChange,
  preSelectedAccount,
}: BatchSplitDialogProps) {
  const [amount, setAmount] = useState<string>('');
  const [isAdding, setIsAdding] = useState(false);
  const { connection, multisigVault } = useMultisigData();
  const { addItem } = useBatchTransactions();

  const validatorAddresses = preSelectedAccount.delegatedValidator
    ? [preSelectedAccount.delegatedValidator]
    : [];
  const { data: validatorMetadata } = useValidatorsMetadata(validatorAddresses);

  const maxSplitable = Math.max(
    0,
    preSelectedAccount.balance - preSelectedAccount.rentExemptReserve - 0.1
  );

  const parsedAmount = parseFloat(amount);
  const isAmountValid = !isNaN(parsedAmount) && parsedAmount > 0 && parsedAmount <= maxSplitable;

  const label = getStakeAccountLabel(preSelectedAccount, validatorMetadata);

  const addToBatch = async () => {
    if (!multisigVault || !isAmountValid) return;

    setIsAdding(true);
    try {
      const lamports = Math.floor(parsedAmount * LAMPORTS_PER_SOL);
      const seed = `split-${Date.now()}`.substring(0, 32);

      const { instructions } = await createSplitStakeInstructions(
        new PublicKey(preSelectedAccount.address),
        multisigVault,
        lamports,
        seed,
        connection
      );

      const added = addItem({
        type: 'split',
        label: `Split ${label}`,
        description: `${parsedAmount.toLocaleString(undefined, { maximumFractionDigits: 2 })} XNT from ${preSelectedAccount.address.slice(0, 8)}...`,
        instructions,
        vaultIndex,
      });

      if (!added) {
        toast.error('Batch queue is full');
        return;
      }

      toast.success('Added split to batch queue');
      setAmount('');
      onOpenChange(false);
    } catch (error: any) {
      toast.error(`Failed to prepare split: ${error?.message || error}`);
    } finally {
      setIsAdding(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Layers className="h-5 w-5" />
            Add Split to Batch
          </DialogTitle>
          <DialogDescription>
            Split a portion of this stake account. The operation will be added to the batch queue.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <StakeAccountDisplay account={preSelectedAccount} />

          <div className="rounded-lg border bg-muted/50 p-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="mb-1 text-xs text-muted-foreground">Total Balance</p>
                <p className="font-medium">
                  {preSelectedAccount.balance.toLocaleString(undefined, {
                    maximumFractionDigits: 2,
                  })}{' '}
                  XNT
                </p>
              </div>
              <div>
                <p className="mb-1 text-xs text-muted-foreground">Max Splitable</p>
                <p className="font-medium">
                  {maxSplitable.toLocaleString(undefined, {
                    maximumFractionDigits: 2,
                  })}{' '}
                  XNT
                </p>
              </div>
            </div>
            {maxSplitable <= 0 && (
              <div className="mt-3 flex items-center gap-1 text-xs text-yellow-600">
                <AlertCircle className="h-3 w-3" />
                <span>Account balance too low to split</span>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="split-amount">Split Amount (XNT)</Label>
            <div className="space-y-2">
              <Input
                id="split-amount"
                placeholder={
                  maxSplitable > 0
                    ? `Enter amount (max ${maxSplitable.toFixed(2)})`
                    : 'No splitable amount'
                }
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                disabled={maxSplitable <= 0}
                className="text-lg"
              />
              {maxSplitable > 0 && (
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setAmount((maxSplitable / 2).toString())}
                    className="flex-1"
                  >
                    50%
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setAmount(maxSplitable.toString())}
                    className="flex-1"
                  >
                    <span className="truncate">
                      Max ({formatXNTCompact(maxSplitable * LAMPORTS_PER_SOL)})
                    </span>
                  </Button>
                </div>
              )}
            </div>

            {amount && !isAmountValid && (
              <div className="flex items-center gap-1 text-xs text-red-500">
                <AlertCircle className="h-3 w-3" />
                <span>
                  {parsedAmount <= 0
                    ? 'Amount must be greater than 0'
                    : `Max splitable: ${maxSplitable.toFixed(2)} XNT`}
                </span>
              </div>
            )}
          </div>

          <Button
            onClick={addToBatch}
            disabled={!isAmountValid || maxSplitable <= 0 || isAdding}
            className="w-full"
            size="lg"
          >
            <Layers className="mr-2 h-4 w-4" />
            {isAdding ? 'Adding...' : 'Add Split to Batch'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
