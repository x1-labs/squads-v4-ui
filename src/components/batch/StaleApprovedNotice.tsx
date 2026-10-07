import { useWallet } from '@solana/wallet-adapter-react';
import { toast } from 'sonner';
import { AlertTriangle } from 'lucide-react';
import { Button } from '../ui/button';
import { useAccess } from '@/hooks/useAccess';
import { useMultisigData } from '@/hooks/useMultisigData';
import { useBatchCancels, MAX_BATCH_CANCELS } from '@/hooks/useBatchCancels';
import { useStaleApprovedProposals } from '@/hooks/useStaleApprovedProposals';

/**
 * Warns about stale proposals that are still Approved: the program can still
 * execute them, but the list only labels them "Stale". Offers to queue the ones
 * this wallet has not yet voted to cancel.
 */
export function StaleApprovedNotice() {
  const { multisigAddress } = useMultisigData();
  const { publicKey } = useWallet();
  const isMember = useAccess();
  const { data: staleApproved } = useStaleApprovedProposals();
  const { addItems, hasItem } = useBatchCancels();

  if (!multisigAddress || !staleApproved || staleApproved.length === 0) {
    return null;
  }

  const notYetCancelledByMe = publicKey
    ? staleApproved.filter((p) => !p.cancelled.some((m) => m.equals(publicKey)))
    : [];

  // A member who has voted to cancel all of them has nothing left to do here.
  if (isMember && publicKey && notYetCancelledByMe.length === 0) {
    return null;
  }

  const handleQueue = () => {
    const pending = notYetCancelledByMe.filter(
      (p) => !hasItem(multisigAddress, p.transactionIndex)
    );
    if (pending.length === 0) {
      toast.info('Already in batch');
      return;
    }
    const added = addItems(
      pending.map((p) => ({
        multisigPda: multisigAddress,
        transactionIndex: p.transactionIndex,
        label: 'Stale, still Approved',
      }))
    );
    if (added === 0) {
      toast.error('Batch is full');
    } else if (added < pending.length) {
      toast.info(`Added ${added}. The batch holds ${MAX_BATCH_CANCELS}; queue the rest after submitting.`);
    } else {
      toast.success(`Added ${added} to batch cancel`);
    }
  };

  return (
    <div className="mb-6 rounded-lg border border-yellow-200 bg-yellow-50 p-4 dark:border-yellow-800 dark:bg-yellow-950/30">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 text-yellow-600 dark:text-yellow-400" />
          <div>
            <h3 className="font-semibold text-yellow-800 dark:text-yellow-300">
              {staleApproved.length} stale {staleApproved.length === 1 ? 'proposal is' : 'proposals are'}{' '}
              still Approved
            </h3>
            <p className="mt-1 text-sm text-yellow-700 dark:text-yellow-400">
              They were approved before going stale, so they can still be executed. Cancel any
              that should not run:{' '}
              {staleApproved.map((p) => `#${p.transactionIndex}`).join(', ')}
            </p>
          </div>
        </div>
        {isMember && notYetCancelledByMe.length > 0 && (
          <Button variant="outline" size="sm" className="flex-shrink-0" onClick={handleQueue}>
            Add {notYetCancelledByMe.length} to batch cancel
          </Button>
        )}
      </div>
    </div>
  );
}
