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
import { useState, useEffect } from 'react';
import { LAMPORTS_PER_SOL } from '@solana/web3.js';
import { toast } from 'sonner';
import { isPublickey } from '@/lib/isPublickey';
import { useMultisigData } from '@/hooks/useMultisigData';
import { useBatchTransactions } from '@/hooks/useBatchTransactions';
import { useValidatorMetadata } from '@/hooks/useValidatorMetadata';
import { getMinimumStakeAmount } from '@/lib/staking/validatorStakeUtils';
import { buildDelegateBatchItem } from '@/lib/staking/batchStakeActions';
import { AlertCircle, Layers } from 'lucide-react';

type BatchDelegateDialogProps = {
  vaultIndex?: number;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
};

export function BatchDelegateDialog({
  vaultIndex = 0,
  isOpen,
  onOpenChange,
}: BatchDelegateDialogProps) {
  const [validatorAddress, setValidatorAddress] = useState('');
  const [amount, setAmount] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [minStake, setMinStake] = useState<number>(1);
  const { connection, multisigVault } = useMultisigData();
  const { addItem, isFull } = useBatchTransactions();
  const { data: validatorInfo } = useValidatorMetadata(
    isPublickey(validatorAddress) ? validatorAddress : undefined
  );

  useEffect(() => {
    getMinimumStakeAmount(connection).then(setMinStake);
  }, [connection]);

  const parsedAmount = parseFloat(amount);
  const isAmountValid = !isNaN(parsedAmount) && parsedAmount >= minStake;
  const isValidatorValid = isPublickey(validatorAddress);

  const addToBatch = async () => {
    if (!multisigVault || !isAmountValid || !isValidatorValid) return;

    setIsAdding(true);
    try {
      const item = await buildDelegateBatchItem(
        validatorAddress,
        validatorInfo?.name,
        parsedAmount,
        multisigVault,
        vaultIndex
      );

      const added = addItem(item);
      if (!added) {
        toast.error('Batch queue is full');
        return;
      }

      toast.success('Added stake delegation to batch queue');
      setValidatorAddress('');
      setAmount('');
      onOpenChange(false);
    } catch (error: any) {
      toast.error(`Failed to prepare delegation: ${error?.message || error}`);
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
            Add Stake to Batch
          </DialogTitle>
          <DialogDescription>
            Create a new stake delegation. The operation will be added to the batch queue.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="validator-address">Validator Vote Account</Label>
            <Input
              id="validator-address"
              placeholder="Validator vote account address"
              type="text"
              value={validatorAddress}
              onChange={(e) => setValidatorAddress(e.target.value)}
            />
            {validatorAddress && !isValidatorValid && (
              <div className="flex items-center gap-1 text-xs text-red-500">
                <AlertCircle className="h-3 w-3" />
                <span>Invalid validator address</span>
              </div>
            )}
            {validatorInfo && (
              <div className="flex items-center gap-2 rounded-lg bg-muted/50 p-2">
                {validatorInfo.avatarUrl && (
                  <img
                    src={validatorInfo.avatarUrl}
                    alt={validatorInfo.name || 'Validator'}
                    className="h-8 w-8 rounded-full"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = 'none';
                    }}
                  />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {validatorInfo.name || 'Unknown Validator'}
                  </p>
                  {validatorInfo.website && (
                    <a
                      href={validatorInfo.website}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-muted-foreground hover:underline"
                    >
                      {validatorInfo.website}
                    </a>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="stake-amount">Amount (XNT)</Label>
            <Input
              id="stake-amount"
              placeholder={`Enter amount (min ${minStake} XNT)`}
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="text-lg"
            />
            {amount && !isAmountValid && (
              <div className="flex items-center gap-1 text-xs text-red-500">
                <AlertCircle className="h-3 w-3" />
                <span>
                  {parsedAmount < minStake
                    ? `Minimum stake is ${minStake} XNT`
                    : 'Invalid amount'}
                </span>
              </div>
            )}
          </div>

          <Button
            onClick={addToBatch}
            disabled={!isValidatorValid || !isAmountValid || isAdding || isFull}
            className="w-full"
            size="lg"
          >
            <Layers className="mr-2 h-4 w-4" />
            {isFull ? 'Batch Queue Full' : isAdding ? 'Adding...' : 'Add Stake to Batch'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
