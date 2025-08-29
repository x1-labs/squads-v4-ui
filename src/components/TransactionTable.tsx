import * as multisig from '@sqds/multisig';
import ExecuteButton from './ExecuteButton';
import RejectButton from './RejectButton';
import CancelButton from './CancelButton';
import ReviewButton from './ReviewButton';
import { ApprovalStatus } from './ApprovalStatus';
import { TableBody, TableCell, TableRow } from './ui/table';
import { useNavigate } from 'react-router-dom';
import { useMultisig } from '@/hooks/useServices';
import { toast } from 'sonner';
import { TransactionTagList } from './TransactionTag';
import { TransactionTag } from '../lib/tags/types';

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
}

export default function TransactionTable({
  multisigPda,
  transactions,
  programId,
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
}) {
  const navigate = useNavigate();
  const { data: multisigConfig } = useMultisig();

  if (transactions.length === 0) {
    return (
      <TableBody>
        <TableRow>
          <TableCell colSpan={4} className="h-32">
            <div className="flex flex-col items-center justify-center space-y-3">
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
          </TableCell>
        </TableRow>
      </TableBody>
    );
  }

  const handleRowClick = (transactionPda: string, e: React.MouseEvent) => {
    // Don't navigate if clicking on a button
    const target = e.target as HTMLElement;
    if (target.closest('button')) {
      return;
    }
    navigate(`/transactions/${transactionPda}`);
  };

  return (
    <TableBody>
      {transactions.map((transaction, index) => {
        const stale =
          (multisigConfig &&
            Number(multisigConfig.staleTransactionIndex) > Number(transaction.index)) ||
          false;
        const isExecuted = transaction.proposal?.status.__kind === 'Executed';
        const isCancelled = transaction.proposal?.status.__kind === 'Cancelled';
        const isRejected = transaction.proposal?.status.__kind === 'Rejected';
        const isGreyedOut = isExecuted || isCancelled || stale || isRejected;
        return (
          <TableRow
            key={index}
            onClick={(e) => handleRowClick(transaction.transactionPda, e)}
            className={`cursor-pointer transition-colors ${
              isGreyedOut ? 'opacity-60 hover:bg-muted/30 hover:opacity-80' : 'hover:bg-muted/50'
            } group`}
          >
            <TableCell
              className={`font-mono text-sm ${isGreyedOut ? 'text-muted-foreground' : ''}`}
            >
              <span
                className={`inline-flex h-8 w-8 items-center justify-center rounded-full ${
                  isGreyedOut ? 'bg-muted/60' : 'bg-muted'
                } text-xs font-semibold`}
              >
                {Number(transaction.index)}
              </span>
            </TableCell>
            <TableCell className={isGreyedOut ? 'text-muted-foreground' : ''}>
              <div className="flex flex-col gap-1.5">
                {/* Transaction hash with type badge */}
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs text-muted-foreground">
                    {formatAddress(transaction.transactionPda)}
                  </span>
                  {transaction.transactionType && (
                    <span
                      className={`inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium ${
                        transaction.transactionType === 'vault'
                          ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400'
                          : transaction.transactionType === 'config'
                            ? 'bg-purple-500/10 text-purple-600 dark:text-purple-400'
                            : 'bg-gray-500/10 text-gray-600 dark:text-gray-400'
                      }`}
                    >
                      {transaction.transactionType === 'vault'
                        ? 'Vault'
                        : transaction.transactionType === 'config'
                          ? 'Config'
                          : 'Unknown'}
                    </span>
                  )}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      navigator.clipboard.writeText(transaction.transactionPda);
                      toast.success('Address copied to clipboard');
                    }}
                    className="rounded p-1 opacity-0 transition-opacity hover:bg-muted group-hover:opacity-100"
                    title="Copy address"
                  >
                    <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                      />
                    </svg>
                  </button>
                </div>

                {/* Tags on separate line with better styling */}
                {transaction.tags && transaction.tags.length > 0 && (
                  <div className="flex items-center gap-1">
                    <TransactionTagList
                      tags={transaction.tags}
                      size="sm"
                      maxTags={5}
                      showIcon={false}
                    />
                  </div>
                )}
              </div>
            </TableCell>
            <TableCell className={isGreyedOut ? 'text-muted-foreground' : ''}>
              <div className="flex items-center gap-3">
                <ApprovalStatus proposal={transaction.proposal} compact={true} isStale={stale} />
              </div>
            </TableCell>
            <TableCell className="text-right">
              {(!stale || isExecuted || isCancelled) && (
                <ActionButtons
                  multisigPda={multisigPda!}
                  transactionIndex={Number(transaction.index)}
                  transactionPda={transaction.transactionPda}
                  proposalStatus={transaction.proposal?.status.__kind || 'None'}
                  programId={programId ? programId : multisig.PROGRAM_ID.toBase58()}
                />
              )}
            </TableCell>
          </TableRow>
        );
      })}
    </TableBody>
  );
}

function ActionButtons({
  multisigPda,
  transactionIndex,
  transactionPda,
  proposalStatus,
  programId,
}: ActionButtonsProps) {
  // Determine which buttons to show based on status
  const showReject = ['None', 'Draft', 'Active'].includes(proposalStatus);
  const showExecute = proposalStatus === 'Approved';
  const showCancel = proposalStatus === 'Approved';

  return (
    <div className="flex items-center justify-end gap-1">
      {showReject && <ReviewButton transactionPda={transactionPda} />}
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
