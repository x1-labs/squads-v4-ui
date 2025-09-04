import React from 'react';
import * as multisig from '@sqds/multisig';
import { useMultisig } from '@/hooks/useServices';
import { CheckCircle, Circle, XCircle, Clock } from 'lucide-react';

interface ApprovalStatusProps {
  proposal: multisig.generated.Proposal | null;
  compact?: boolean;
  isStale?: boolean;
}

export const ApprovalStatus: React.FC<ApprovalStatusProps> = ({
  proposal,
  compact = false,
  isStale = false,
}) => {
  const { data: multisigConfig } = useMultisig();

  if (!proposal || !multisigConfig) {
    return null;
  }

  const threshold = multisigConfig.threshold;
  const approvedCount = proposal.approved.length;
  const rejectedCount = proposal.rejected.length;
  const cancelledCount = proposal.cancelled.length;
  const status = proposal.status.__kind;

  const getStatusDisplay = () => {
    if (['Executed', 'Cancelled', 'Rejected'].includes(status)) {
      return status;
    }
    if (isStale) {
      return 'Stale';
    }
    return `${approvedCount}/${threshold}`;
  };

  const isFinalized = ['Executed', 'Cancelled', 'Rejected'].includes(status);
  const progressPercentage = (approvedCount / threshold) * 100;

  const getStatusColor = () => {
    // If transaction is stale but not executed/cancelled, grey it out
    if (isStale && status !== 'Executed' && status !== 'Cancelled') {
      return 'text-muted-foreground bg-muted border-border';
    }

    switch (status) {
      case 'Approved':
        return 'text-green-500 bg-green-500/10 border-green-500/20';
      case 'Rejected':
        return 'text-muted-foreground bg-muted border-border';
      case 'Cancelled':
        return 'text-muted-foreground bg-muted border-border';
      case 'Executed':
        return 'text-muted-foreground bg-muted border-border';
      case 'Active':
      case 'Draft':
        if (approvedCount >= threshold) {
          return 'text-green-500 bg-green-500/10 border-green-500/20';
        }
        return 'text-warning bg-warning/10 border-warning/20';
      default:
        return 'text-muted-foreground bg-muted border-border';
    }
  };

  const getStatusIcon = () => {
    switch (status) {
      case 'Approved':
        return <CheckCircle className="h-4 w-4" />;
      case 'Executed':
        return <CheckCircle className="h-4 w-4" />;
      case 'Rejected':
        return <XCircle className="h-4 w-4" />;
      case 'Cancelled':
        return <XCircle className="h-4 w-4" />;
      case 'Active':
      case 'Draft':
        if (approvedCount >= threshold) {
          return <CheckCircle className="h-4 w-4" />;
        }
        return <Clock className="h-4 w-4" />;
      default:
        return <Circle className="h-4 w-4" />;
    }
  };

  // Helper function to format addresses
  const formatMemberAddress = (address: string) => {
    return `${address.slice(0, 8)}...${address.slice(-8)}`;
  };

  if (compact) {
    // Compact view for table
    const hasVotes = (approvedCount > 0 || rejectedCount > 0 || cancelledCount > 0) && !isFinalized;

    return (
      <div className="flex items-center gap-1.5">
        {/* Main status badge with combined tooltip on hover */}
        <div className="group relative">
          <div
            className={`flex items-center gap-1 rounded-md border px-2 py-1 ${getStatusColor()}`}
          >
            {getStatusIcon()}
            <span className="text-xs font-medium">{getStatusDisplay()}</span>
          </div>
          {hasVotes && (
            <div className="absolute bottom-full left-0 z-50 mb-2 hidden w-72 rounded-md border bg-popover p-3 shadow-lg group-hover:block">
              {approvedCount > 0 && (
                <div className="mb-3">
                  <p className="mb-1.5 text-xs font-semibold text-green-600 dark:text-green-400">
                    Approved by {approvedCount} member(s):
                  </p>
                  <div className="space-y-0.5">
                    {proposal.approved.map((member, idx) => (
                      <div key={idx} className="font-mono text-xs text-muted-foreground">
                        {formatMemberAddress(member.toBase58())}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {rejectedCount > 0 && (
                <div className={approvedCount > 0 ? 'mb-3' : 'mb-3'}>
                  <p className="mb-1.5 text-xs font-semibold text-destructive">
                    Rejected by {rejectedCount} member(s):
                  </p>
                  <div className="space-y-0.5">
                    {proposal.rejected.map((member, idx) => (
                      <div key={idx} className="font-mono text-xs text-muted-foreground">
                        {formatMemberAddress(member.toBase58())}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {cancelledCount > 0 && (
                <div>
                  <p className="mb-1.5 text-xs font-semibold text-yellow-600 dark:text-yellow-500">
                    Cancelled by {cancelledCount} member(s):
                  </p>
                  <div className="space-y-0.5">
                    {proposal.cancelled.map((member, idx) => (
                      <div key={idx} className="font-mono text-xs text-muted-foreground">
                        {formatMemberAddress(member.toBase58())}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Rejected count badge (no tooltip) */}
        {rejectedCount > 0 && !isFinalized && (
          <div className="flex items-center gap-1 rounded-md border border-destructive/20 bg-destructive/10 px-2 py-1">
            <XCircle className="h-3.5 w-3.5 text-destructive" />
            <span className="text-xs font-medium text-destructive">{rejectedCount}</span>
          </div>
        )}

        {/* Cancelled count badge (no tooltip) */}
        {cancelledCount > 0 && !isFinalized && (
          <div className="flex items-center gap-1 rounded-md border border-yellow-500/20 bg-yellow-500/10 px-2 py-1">
            <XCircle className="h-3.5 w-3.5 text-yellow-600 dark:text-yellow-500" />
            <span className="text-xs font-medium text-yellow-600 dark:text-yellow-500">
              {cancelledCount}
            </span>
          </div>
        )}
      </div>
    );
  }

  // Detailed view for transaction details page
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        {/* Only show approvals count for active proposals */}
        {isFinalized ? (
          <div className={`flex items-center gap-1 ${getStatusColor().split(' ')[0]}`}>
            {getStatusIcon()}
            <span className="text-sm font-medium capitalize">{status.toLowerCase()}</span>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-foreground">Approvals</span>
              <span className={`rounded-md px-2 py-1 text-sm font-medium ${getStatusColor()}`}>
                {approvedCount} / {threshold}
              </span>
            </div>
            <div className={`flex items-center gap-1 ${getStatusColor().split(' ')[0]}`}>
              {getStatusIcon()}
              <span className="text-sm font-medium capitalize">{status.toLowerCase()}</span>
            </div>
          </>
        )}
      </div>

      {/* Progress bar - only show for active proposals */}
      {!isFinalized && (
        <div className="relative h-2.5 w-full rounded-full bg-gray-200 dark:bg-gray-700">
          <div
            className={`absolute left-0 top-0 h-full rounded-full transition-all duration-300 ${
              approvedCount >= threshold ? 'bg-green-500' : 'bg-yellow-400'
            }`}
            style={{
              width: `${Math.min(progressPercentage, 100)}%`,
              minWidth: approvedCount > 0 ? '1rem' : '0',
            }}
          />
        </div>
      )}

      {/* Member votes breakdown */}
      <div className="space-y-2">
        {approvedCount > 0 && (
          <div>
            <span className="mb-1 block text-xs text-muted-foreground">Approved by:</span>
            <div className="flex flex-wrap gap-1">
              {proposal.approved.map((member, idx) => (
                <span
                  key={idx}
                  className={`rounded px-2 py-1 text-xs ${
                    isFinalized || isStale
                      ? 'bg-muted text-muted-foreground'
                      : 'bg-green-500/10 text-green-600 dark:text-green-400'
                  }`}
                >
                  {member.toBase58().slice(0, 4)}...{member.toBase58().slice(-4)}
                </span>
              ))}
            </div>
          </div>
        )}

        {rejectedCount > 0 && (
          <div>
            <span className="mb-1 block text-xs text-muted-foreground">Rejected by:</span>
            <div className="flex flex-wrap gap-1">
              {proposal.rejected.map((member, idx) => (
                <span
                  key={idx}
                  className={`rounded px-2 py-1 text-xs ${
                    isFinalized || isStale
                      ? 'bg-muted text-muted-foreground'
                      : 'bg-destructive/10 text-destructive'
                  }`}
                >
                  {member.toBase58().slice(0, 4)}...{member.toBase58().slice(-4)}
                </span>
              ))}
            </div>
          </div>
        )}

        {cancelledCount > 0 && (
          <div>
            <span className="mb-1 block text-xs text-muted-foreground">Cancelled by:</span>
            <div className="flex flex-wrap gap-1">
              {proposal.cancelled.map((member, idx) => (
                <span
                  key={idx}
                  className={`rounded px-2 py-1 text-xs ${
                    isFinalized || isStale
                      ? 'bg-muted text-muted-foreground'
                      : 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-500'
                  }`}
                >
                  {member.toBase58().slice(0, 4)}...{member.toBase58().slice(-4)}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Additional info */}
      {status === 'Active' && approvedCount < threshold && (
        <div className="text-xs text-muted-foreground">
          Need {threshold - approvedCount} more approval{threshold - approvedCount !== 1 ? 's' : ''}{' '}
          to execute
        </div>
      )}
    </div>
  );
};
