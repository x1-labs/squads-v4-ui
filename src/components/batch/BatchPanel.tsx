import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import {
  useBatchTransactions,
  BatchItem,
  MAX_BATCH_INSTRUCTIONS,
} from '@/hooks/useBatchTransactions';
import { useMultisigData } from '@/hooks/useMultisigData';
import { useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { useQueryClient } from '@tanstack/react-query';
import { useAccess } from '@/hooks/useAccess';
import { toast } from 'sonner';
import {
  submitBatchProposal,
  BatchProgress,
} from '@/lib/transaction/batchProposals';
import {
  X,
  Trash2,
  Send,
  Layers,
  ArrowDown,
  Wallet,
  ArrowUpDown,
  Split,
  Merge,
  CircleDot,
  Loader2,
  CheckCircle2,
  XCircle,
} from 'lucide-react';

const typeIcons: Record<string, React.ReactNode> = {
  unstake: <ArrowDown className="h-3.5 w-3.5" />,
  withdraw: <Wallet className="h-3.5 w-3.5" />,
  delegate: <CircleDot className="h-3.5 w-3.5" />,
  redelegate: <ArrowUpDown className="h-3.5 w-3.5" />,
  split: <Split className="h-3.5 w-3.5" />,
  merge: <Merge className="h-3.5 w-3.5" />,
  custom: <Layers className="h-3.5 w-3.5" />,
};

export function BatchPanel() {
  const { items, removeItem, clearAll, itemCount, instructionCount } = useBatchTransactions();
  const { connection, programId, multisigAddress } = useMultisigData();
  const wallet = useWallet();
  const walletModal = useWalletModal();
  const queryClient = useQueryClient();
  const isMember = useAccess();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [progress, setProgress] = useState<BatchProgress | null>(null);

  if (itemCount === 0) {
    return null;
  }

  const handleSubmit = async () => {
    if (!wallet.publicKey) {
      walletModal.setVisible(true);
      return;
    }

    if (!wallet.signTransaction) {
      toast.error('Your wallet does not support transaction signing.');
      return;
    }

    if (!multisigAddress) {
      toast.error('No multisig selected');
      return;
    }

    setIsSubmitting(true);
    setProgress(null);

    try {
      await submitBatchProposal(
        items.map((item) => ({
          instructions: item.instructions,
          vaultIndex: item.vaultIndex,
          label: item.label,
        })),
        connection,
        multisigAddress,
        programId,
        wallet,
        (p) => setProgress({ ...p })
      );

      toast.success(`Proposal created with ${itemCount} operations`);
      clearAll();
      await queryClient.invalidateQueries({ queryKey: ['transactions'] });
      await queryClient.invalidateQueries({ queryKey: ['stakeAccounts'] });
    } catch (error: any) {
      toast.error(`Submission failed: ${error?.message || error}`);
    } finally {
      setIsSubmitting(false);
      setProgress(null);
    }
  };

  const getProgressText = () => {
    if (!progress) return '';
    switch (progress.currentStep) {
      case 'preparing':
        return 'Preparing transaction...';
      case 'signing':
        return 'Please approve in your wallet...';
      case 'sending':
        return 'Sending transaction...';
      case 'confirming':
        return 'Confirming...';
      case 'done':
        return 'Proposal created!';
      case 'error':
        return progress.error || 'Error occurred';
      default:
        return '';
    }
  };

  return (
    <Card className="border-primary/20 bg-primary/5">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Layers className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg">Batch Queue</CardTitle>
            <Badge
              variant={instructionCount >= MAX_BATCH_INSTRUCTIONS ? 'destructive' : 'secondary'}
              className="ml-1"
            >
              {instructionCount}/{MAX_BATCH_INSTRUCTIONS} ix
            </Badge>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={clearAll}
            disabled={isSubmitting}
            className="text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="mr-1 h-4 w-4" />
            Clear
          </Button>
        </div>
        <CardDescription>
          All operations will be combined into a single multisig proposal.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Queue items */}
        <div className="max-h-64 space-y-2 overflow-y-auto">
          {items.map((item) => (
            <BatchItemRow
              key={item.id}
              item={item}
              onRemove={() => removeItem(item.id)}
              disabled={isSubmitting}
            />
          ))}
        </div>

        {/* Progress display */}
        {isSubmitting && progress && (
          <div className="space-y-2 rounded-lg bg-muted/50 p-3">
            <div className="flex items-center gap-2">
              {progress.currentStep === 'done' ? (
                <CheckCircle2 className="h-4 w-4 text-green-500" />
              ) : progress.currentStep === 'error' ? (
                <XCircle className="h-4 w-4 text-red-500" />
              ) : (
                <Loader2 className="h-4 w-4 animate-spin" />
              )}
              <span className="text-sm">{getProgressText()}</span>
            </div>
          </div>
        )}

        {/* Submit button */}
        <Button
          className="w-full"
          onClick={handleSubmit}
          disabled={isSubmitting || !isMember || itemCount === 0}
        >
          {isSubmitting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Submitting...
            </>
          ) : (
            <>
              <Send className="mr-2 h-4 w-4" />
              Submit Proposal ({itemCount} {itemCount === 1 ? 'operation' : 'operations'})
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}

function BatchItemRow({
  item,
  onRemove,
  disabled,
}: {
  item: BatchItem;
  onRemove: () => void;
  disabled: boolean;
}) {
  return (
    <div className="flex items-center justify-between rounded-lg bg-background p-2.5 shadow-sm">
      <div className="flex items-center gap-2.5 overflow-hidden">
        <div className="flex-shrink-0 text-muted-foreground">
          {typeIcons[item.type] || typeIcons.custom}
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{item.label}</p>
          <p className="truncate text-xs text-muted-foreground">{item.description}</p>
        </div>
      </div>
      <Button
        variant="ghost"
        size="sm"
        className="h-7 w-7 flex-shrink-0 p-0 text-muted-foreground hover:text-destructive"
        onClick={onRemove}
        disabled={disabled}
      >
        <X className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}
