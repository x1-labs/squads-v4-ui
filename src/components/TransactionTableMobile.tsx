import * as multisig from '@sqds/multisig';
import ExecuteButton from './ExecuteButton';
import RejectButton from './RejectButton';
import CancelButton from './CancelButton';
import ReviewButton from './ReviewButton';
import { ApprovalStatus } from './ApprovalStatus';
import { useNavigate } from 'react-router-dom';
import { useMultisig } from '@/hooks/useServices';
import { toast } from 'sonner';
import { TransactionTagList } from './TransactionTag';
import { TransactionTag } from '@/lib/instructions/types';
import { useWallet } from '@solana/wallet-adapter-react';
import { useAccess } from '@/hooks/useAccess';
import { Checkbox } from './ui/checkbox';

// Format address to show first 8 and last 8 characters
function formatAddress(address: string): string {
  if (!address || address.length <= 20) return address;
  return `${address.slice(0, 8)}...${address.slice(-8)}`;
}

interface ActionButtonsProps {
  multisigPda: string;
  transactionIndex: number;
  transactionPda: string;
  proposalStatus: string;
  programId: string;
  proposal: multisig.generated.Proposal | null;
}

export default function TransactionTableMobile({
  multisigPda,
  transactions,
  programId,
  batchMode = false,
  selectedTxs,
  onToggleTx,
}: {
  multisigPda: string;
  transactions: {
    transactionPda: string;
    proposal: multisig.generated.Proposal | null;
    index: bigint;
    transactionType?: 'vault' | 'config' | 'unknown';
    tags?: TransactionTag[];
  }[];
  programId?: string;
  batchMode?: boolean;
  selectedTxs?: Set<number>;
  onToggleTx?: (index: number) => void;
}) {
  const navigate = useNavigate();
  const { data: multisigConfig } = useMultisig();
  const isMember = useAccess();
  const { connected } = useWallet();

  if (transactions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center space-y-3 py-8">
        <div className="rounded-full bg-muted p-3">
          <svg
            className="h-6 w-6 text-muted-foreground"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
            />
          </svg>
        </div>
        <p className="text-sm text-muted-foreground">No transactions found</p>
        <p className="text-xs text-muted-foreground/70">
          Create your first transaction to get started
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {transactions.map((transaction, index) => {
        const stale =
          (multisigConfig &&
            Number(multisigConfig.staleTransactionIndex) > Number(transaction.index)) ||
          false;
        const isExecuted = transaction.proposal?.status.__kind === 'Executed';
        const isCancelled = transaction.proposal?.status.__kind === 'Cancelled';
        const isRejected = transaction.proposal?.status.__kind === 'Rejected';
        const isGreyedOut = isExecuted || isCancelled || stale || isRejected;
        const proposalStatus = transaction.proposal?.status.__kind || 'None';
        const isApprovable = ['None', 'Draft', 'Active'].includes(proposalStatus) && !stale;
        const txIndex = Number(transaction.index);
        const isSelected = selectedTxs?.has(txIndex) ?? false;

        return (
          <div
            key={index}
            onClick={() => {
              if (batchMode && isApprovable) {
                onToggleTx?.(txIndex);
                return;
              }
              navigate(`/${multisigPda}/transactions/${transaction.transactionPda}`);
            }}
            className={`cursor-pointer rounded-lg border p-4 transition-colors ${
              batchMode && isSelected
                ? 'border-primary/30 bg-primary/10 ring-1 ring-primary/30'
                : isGreyedOut
                  ? 'border-border bg-card opacity-60 hover:opacity-80'
                  : 'border-border bg-card hover:bg-muted/50'
            }`}
          >
            {/* Header Row */}
            <div className="mb-3 flex items-start justify-between">
              <div className="flex items-center gap-2">
                {batchMode && isApprovable && (
                  <Checkbox
                    checked={isSelected}
                    onCheckedChange={() => onToggleTx?.(txIndex)}
                    onClick={(e) => e.stopPropagation()}
                  />
                )}
                <span
                  className={`inline-flex h-7 w-7 items-center justify-center rounded-full ${
                    isGreyedOut ? 'bg-muted/60' : 'bg-muted'
                  } text-xs font-semibold`}
                >
                  {Number(transaction.index)}
                </span>
                <div>
                  <p className="font-mono text-xs text-muted-foreground">
                    {formatAddress(transaction.transactionPda)}
                  </p>
                </div>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  navigator.clipboard.writeText(transaction.transactionPda);
                  toast.success('Copied!');
                }}
                className="rounded p-1.5 hover:bg-muted"
                title="Copy address"
              >
                <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                  />
                </svg>
              </button>
            </div>

            {/* Tags */}
            {transaction.tags && transaction.tags.length > 0 && (
              <div className="mb-3 flex flex-wrap gap-1">
                <TransactionTagList
                  tags={transaction.tags}
                  size="sm"
                  maxTags={3}
                  showIcon={false}
                />
              </div>
            )}

            {/* Status */}
            <div className="mb-3">
              <ApprovalStatus proposal={transaction.proposal} isStale={stale} compact={true} />
            </div>

            {/* Action Buttons */}
            {isMember && connected && (
              <ActionButtons
                multisigPda={multisigPda!}
                transactionIndex={Number(transaction.index)}
                transactionPda={transaction.transactionPda}
                proposalStatus={transaction.proposal?.status.__kind || 'None'}
                programId={programId ? programId : multisig.PROGRAM_ID.toBase58()}
                proposal={transaction.proposal}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

function ActionButtons({
  multisigPda,
  transactionIndex,
  transactionPda,
  proposalStatus,
  programId,
  proposal,
}: ActionButtonsProps) {
  const wallet = useWallet();

  // Check if current user has already rejected or cancelled
  const hasUserRejected = proposal?.rejected?.some((member) =>
    wallet.publicKey ? member.equals(wallet.publicKey) : false
  );
  const hasUserCancelled = proposal?.cancelled?.some((member) =>
    wallet.publicKey ? member.equals(wallet.publicKey) : false
  );
  const hasUserTakenNegativeAction = hasUserRejected || hasUserCancelled;

  // Determine which buttons to show based on status
  const showReject =
    !hasUserTakenNegativeAction && ['None', 'Draft', 'Active'].includes(proposalStatus);
  const showExecute = !hasUserTakenNegativeAction && proposalStatus === 'Approved';
  const showCancel = !hasUserTakenNegativeAction && proposalStatus === 'Approved';

  return (
    <div className="flex flex-wrap gap-2" onClick={(e) => e.stopPropagation()}>
      {showReject && <ReviewButton multisigPda={multisigPda} transactionPda={transactionPda} />}
      {showReject && (
        <RejectButton
          multisigPda={multisigPda}
          transactionIndex={transactionIndex}
          proposalStatus={proposalStatus}
          programId={programId}
        />
      )}
      {showExecute && (
        <ExecuteButton
          multisigPda={multisigPda}
          transactionIndex={transactionIndex}
          proposalStatus={proposalStatus}
          programId={programId}
        />
      )}
      {showCancel && (
        <CancelButton
          multisigPda={multisigPda}
          transactionIndex={transactionIndex}
          proposalStatus={proposalStatus}
          programId={programId}
        />
      )}
    </div>
  );
}
