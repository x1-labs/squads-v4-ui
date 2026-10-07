import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { useBatchCancels, BatchCancelItem, MAX_BATCH_CANCELS } from '@/hooks/useBatchCancels';
import { useMultisigData } from '@/hooks/useMultisigData';
import { useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { useQueryClient } from '@tanstack/react-query';
import { useAccess } from '@/hooks/useAccess';
import { toast } from 'sonner';
import { submitBatchCancels } from '@/lib/transaction/batchCancels';
import type { SendStep } from '@/lib/transaction/signSendAndConfirm';
import { PublicKey } from '@solana/web3.js';
import * as multisig from '@sqds/multisig';
import { X, Trash2, Ban, Layers, Loader2, CheckCircle2, XCircle } from 'lucide-react';

type ProgressStep = SendStep | 'done' | 'error';

interface Progress {
  currentStep: ProgressStep;
  error?: string;
}

export function BatchCancelPanel() {
  const { itemsFor, removeItem, clearMultisig } = useBatchCancels();
  const { connection, programId, multisigAddress } = useMultisigData();
  const wallet = useWallet();
  const walletModal = useWalletModal();
  const queryClient = useQueryClient();
  const isMember = useAccess();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [progress, setProgress] = useState<Progress | null>(null);

  const items = multisigAddress ? itemsFor(multisigAddress) : [];
  const itemCount = items.length;

  if (!multisigAddress || itemCount === 0) {
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

    if (!programId) {
      toast.error('No multisig selected');
      return;
    }

    setIsSubmitting(true);
    setProgress({ currentStep: 'preparing' });

    try {
      // One ineligible cancel fails the whole transaction (AlreadyCancelled, or
      // InvalidProposalStatus once a proposal reaches Cancelled), so re-read
      // each proposal and keep only those this wallet can still cancel.
      const multisigPubkey = new PublicKey(multisigAddress);
      const checks = await Promise.all(
        items.map(async (item) => {
          const [proposalPda] = multisig.getProposalPda({
            multisigPda: multisigPubkey,
            transactionIndex: BigInt(item.transactionIndex),
            programId,
          });
          try {
            const proposal = await multisig.accounts.Proposal.fromAccountAddress(
              connection as any,
              proposalPda
            );
            const alreadyCancelled = proposal.cancelled.some((m: PublicKey) =>
              m.equals(wallet.publicKey!)
            );
            return { item, eligible: proposal.status.__kind === 'Approved' && !alreadyCancelled };
          } catch {
            return { item, eligible: false };
          }
        })
      );

      const eligible = checks.filter((c) => c.eligible).map((c) => c.item.transactionIndex);
      const skipped = itemCount - eligible.length;

      if (eligible.length === 0) {
        toast.info('Nothing left to cancel: already cancelled by you, or no longer Approved');
        clearMultisig(multisigAddress);
        return;
      }

      if (skipped > 0) {
        toast.info(
          `Skipping ${skipped} ${skipped === 1 ? 'proposal' : 'proposals'} already cancelled by you or no longer Approved`
        );
      }

      await submitBatchCancels(
        eligible,
        connection,
        multisigAddress,
        programId,
        wallet,
        (step) => setProgress({ currentStep: step })
      );

      setProgress({ currentStep: 'done' });
      toast.success(`Voted to cancel ${eligible.length} ${eligible.length === 1 ? 'proposal' : 'proposals'}`);
      clearMultisig(multisigAddress);

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['transactions'] }),
        queryClient.invalidateQueries({ queryKey: ['multisig'] }),
        queryClient.invalidateQueries({ queryKey: ['proposal'] }),
        queryClient.invalidateQueries({ queryKey: ['transaction-details'] }),
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
      case 'confirming':
        return 'Confirming...';
      case 'done':
        return 'Cancel votes submitted!';
      case 'error':
        return progress.error || 'Error occurred';
      default:
        return '';
    }
  };

  return (
    <Card className="mb-6 border-destructive/20 bg-destructive/5">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Ban className="h-5 w-5 text-destructive" />
            <CardTitle className="text-lg">Batch Cancels</CardTitle>
            <Badge
              variant={itemCount >= MAX_BATCH_CANCELS ? 'destructive' : 'secondary'}
              className="ml-1"
            >
              {itemCount}/{MAX_BATCH_CANCELS}
            </Badge>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => clearMultisig(multisigAddress)}
            disabled={isSubmitting}
            className="text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="mr-1 h-4 w-4" />
            Clear
          </Button>
        </div>
        <CardDescription>
          Vote to cancel multiple Approved proposals on multisig{' '}
          <span className="font-mono">
            {multisigAddress.slice(0, 4)}...{multisigAddress.slice(-4)}
          </span>{' '}
          in a single transaction. A proposal is cancelled for good once enough members (the
          threshold) have voted.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="max-h-64 space-y-2 overflow-y-auto">
          {items.map((item) => (
            <BatchCancelItemRow
              key={item.id}
              item={item}
              onRemove={() => removeItem(item.id)}
              disabled={isSubmitting}
            />
          ))}
        </div>

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

        <Button
          className="w-full"
          variant="destructive"
          onClick={handleSubmit}
          disabled={isSubmitting || !isMember}
        >
          {isSubmitting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Submitting...
            </>
          ) : (
            <>
              <Ban className="mr-2 h-4 w-4" />
              Cancel {itemCount} {itemCount === 1 ? 'Proposal' : 'Proposals'}
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}

function BatchCancelItemRow({
  item,
  onRemove,
  disabled,
}: {
  item: BatchCancelItem;
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
