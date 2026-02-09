import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { useBatchApprovals, BatchApprovalItem } from '@/hooks/useBatchApprovals';
import { useMultisigData } from '@/hooks/useMultisigData';
import { useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { useQueryClient } from '@tanstack/react-query';
import { useAccess } from '@/hooks/useAccess';
import { toast } from 'sonner';
import { submitBatchApprovals } from '@/lib/transaction/batchApprovals';
import {
  X,
  Trash2,
  CheckCircle,
  Layers,
  Loader2,
  CheckCircle2,
  XCircle,
  FileCheck,
} from 'lucide-react';

type ProgressStep = 'preparing' | 'signing' | 'sending' | 'confirming' | 'done' | 'error';

interface Progress {
  currentStep: ProgressStep;
  error?: string;
}

export function BatchApprovalPanel() {
  const { items, removeItem, clearAll, itemCount } = useBatchApprovals();
  const { connection, programId, multisigAddress } = useMultisigData();
  const wallet = useWallet();
  const walletModal = useWalletModal();
  const queryClient = useQueryClient();
  const isMember = useAccess();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [progress, setProgress] = useState<Progress | null>(null);

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

    if (!multisigAddress || !programId) {
      toast.error('No multisig selected');
      return;
    }

    setIsSubmitting(true);
    setProgress({ currentStep: 'preparing' });

    try {
      setProgress({ currentStep: 'signing' });

      await submitBatchApprovals(
        items.map((item) => ({
          transactionIndex: item.transactionIndex,
          proposalStatus: item.proposalStatus,
        })),
        connection,
        multisigAddress,
        programId,
        wallet
      );

      setProgress({ currentStep: 'done' });
      toast.success(`Approved ${itemCount} proposals`);
      clearAll();

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['transactions'] }),
        queryClient.invalidateQueries({ queryKey: ['multisig'] }),
        queryClient.invalidateQueries({ queryKey: ['proposal'] }),
      ]);
    } catch (error: any) {
      const msg = error?.message || String(error);
      if (!msg.includes('User rejected')) {
        setProgress({ currentStep: 'error', error: msg });
        toast.error(msg.length > 200 ? msg.substring(0, 200) + '...' : msg);
      }
    } finally {
      setIsSubmitting(false);
      setTimeout(() => setProgress(null), 2000);
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
        return 'Approvals submitted!';
      case 'error':
        return progress.error || 'Error occurred';
      default:
        return '';
    }
  };

  return (
    <Card className="border-primary/20 bg-primary/5 mb-6">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileCheck className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg">Batch Approvals</CardTitle>
            <Badge variant="secondary" className="ml-1">
              {itemCount} {itemCount === 1 ? 'proposal' : 'proposals'}
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
          Review and approve multiple proposals in a single transaction.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Queue items */}
        <div className="max-h-64 space-y-2 overflow-y-auto">
          {items.map((item) => (
            <BatchApprovalItemRow
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
              <CheckCircle className="mr-2 h-4 w-4" />
              Approve {itemCount} {itemCount === 1 ? 'Proposal' : 'Proposals'}
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}

function BatchApprovalItemRow({
  item,
  onRemove,
  disabled,
}: {
  item: BatchApprovalItem;
  onRemove: () => void;
  disabled: boolean;
}) {
  return (
    <div className="flex items-center justify-between rounded-lg bg-background p-2.5 shadow-sm">
      <div className="flex items-center gap-2.5 overflow-hidden">
        <div className="flex-shrink-0 text-muted-foreground">
          <Layers className="h-3.5 w-3.5" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">#{item.transactionIndex}</p>
          <p className="truncate text-xs text-muted-foreground">{item.label}</p>
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
