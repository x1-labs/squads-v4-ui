import React from 'react';
import * as multisig from '@sqds/multisig';
import { useMultisig } from '@/hooks/useServices';
import { CheckCircle, Circle, XCircle, Clock } from 'lucide-react';

interface ApprovalStatusProps {
  proposal: multisig.generated.Proposal | null;
  compact?: boolean;
}

export const ApprovalStatus: React.FC<ApprovalStatusProps> = ({ proposal, compact = false }) => {
  const { data: multisigConfig } = useMultisig();
  
  if (!proposal || !multisigConfig) {
    return null;
  }

  const threshold = multisigConfig.threshold;
  const approvedCount = proposal.approved.length;
  const rejectedCount = proposal.rejected.length;
  const cancelledCount = proposal.cancelled.length;
  const status = proposal.status.__kind;

  // Calculate progress percentage
  const progressPercentage = (approvedCount / threshold) * 100;

  // Determine status color
  const getStatusColor = () => {
    switch (status) {
      case 'Approved':
        return 'text-green-500 bg-green-500/10 border-green-500/20';
      case 'Rejected':
        return 'text-destructive bg-destructive/10 border-destructive/20';
      case 'Cancelled':
        return 'text-muted-foreground bg-muted border-border';
      case 'Executed':
        return 'text-primary bg-primary/10 border-primary/20';
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
      case 'Executed':
        return <CheckCircle className="w-4 h-4" />;
      case 'Rejected':
      case 'Cancelled':
        return <XCircle className="w-4 h-4" />;
      case 'Active':
      case 'Draft':
        if (approvedCount >= threshold) {
          return <CheckCircle className="w-4 h-4" />;
        }
        return <Clock className="w-4 h-4" />;
      default:
        return <Circle className="w-4 h-4" />;
    }
  };

  if (compact) {
    // Compact view for table
    return (
      <div className="flex items-center gap-2">
        <div className={`flex items-center gap-1 px-2 py-1 rounded-md border ${getStatusColor()}`}>
          {getStatusIcon()}
          <span className="text-xs font-medium">
            {/* Don't show approval count for executed/cancelled/rejected as threshold may have changed */}
            {['Executed', 'Cancelled', 'Rejected'].includes(status) 
              ? status 
              : `${approvedCount}/${threshold}`
            }
          </span>
        </div>
        {rejectedCount > 0 && !['Executed', 'Cancelled', 'Rejected'].includes(status) && (
          <span className="text-xs text-destructive">
            ({rejectedCount} rejected)
          </span>
        )}
      </div>
    );
  }

  // Check if we should hide the progress bar
  const hideProgressBar = ['Executed', 'Cancelled', 'Rejected'].includes(status);

  // Detailed view for transaction details page
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        {/* Only show approvals count for active proposals */}
        {['Executed', 'Cancelled', 'Rejected'].includes(status) ? (
          <div className={`flex items-center gap-1 ${getStatusColor().split(' ')[0]}`}>
            {getStatusIcon()}
            <span className="text-sm font-medium capitalize">{status.toLowerCase()}</span>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-foreground">Approvals</span>
              <span className={`px-2 py-1 rounded-md text-sm font-medium ${getStatusColor()}`}>
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
      {!hideProgressBar && (
        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2.5 relative">
          <div 
            className={`absolute top-0 left-0 h-full rounded-full transition-all duration-300 ${
              approvedCount >= threshold ? 'bg-green-500' : 'bg-yellow-400'
            }`}
            style={{ 
              width: `${Math.min(progressPercentage, 100)}%`,
              minWidth: approvedCount > 0 ? '1rem' : '0' 
            }}
          />
        </div>
      )}

      {/* Member votes breakdown */}
      <div className="space-y-2">
        {approvedCount > 0 && (
          <div>
            <span className="text-xs text-muted-foreground block mb-1">Approved by:</span>
            <div className="flex flex-wrap gap-1">
              {proposal.approved.map((member, idx) => (
                <span key={idx} className="text-xs bg-green-500/10 text-green-600 dark:text-green-400 px-2 py-1 rounded">
                  {member.toBase58().slice(0, 4)}...{member.toBase58().slice(-4)}
                </span>
              ))}
            </div>
          </div>
        )}
        
        {rejectedCount > 0 && (
          <div>
            <span className="text-xs text-muted-foreground block mb-1">Rejected by:</span>
            <div className="flex flex-wrap gap-1">
              {proposal.rejected.map((member, idx) => (
                <span key={idx} className="text-xs bg-destructive/10 text-destructive px-2 py-1 rounded">
                  {member.toBase58().slice(0, 4)}...{member.toBase58().slice(-4)}
                </span>
              ))}
            </div>
          </div>
        )}

        {cancelledCount > 0 && (
          <div>
            <span className="text-xs text-muted-foreground block mb-1">Cancelled by:</span>
            <div className="flex flex-wrap gap-1">
              {proposal.cancelled.map((member, idx) => (
                <span key={idx} className="text-xs bg-muted text-muted-foreground px-2 py-1 rounded">
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
          Need {threshold - approvedCount} more approval{threshold - approvedCount !== 1 ? 's' : ''} to execute
        </div>
      )}
    </div>
  );
};