import React from 'react';
import { Copy, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import { useExplorerUrl } from '@/hooks/useSettings';
import { ValidatorMetadata } from '@/lib/staking/validatorMetadata';

interface ValidatorDisplayProps {
  voteAccount: string;
  metadata?: ValidatorMetadata | null;
  showIdentity?: boolean;
}

export const ValidatorDisplay: React.FC<ValidatorDisplayProps> = ({
  voteAccount,
  metadata,
  showIdentity = true,
}) => {
  const { explorerUrl } = useExplorerUrl();

  return (
    <div className="space-y-1">
      {(metadata?.name || metadata?.avatarUrl) && (
        <div className="flex items-center gap-2">
          {metadata.avatarUrl && (
            <img
              src={metadata.avatarUrl}
              alt={metadata.name || 'Validator'}
              className="h-5 w-5 rounded-full"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = 'none';
              }}
            />
          )}
          {metadata.name && (
            <div className="text-sm font-medium text-foreground">{metadata.name}</div>
          )}
        </div>
      )}
      <div className="flex items-center gap-1">
        <span className="text-xs text-muted-foreground">Vote:</span>
        <code className="flex-1 break-all rounded bg-muted px-1.5 py-0.5 text-xs">
          {voteAccount}
        </code>
        <button
          onClick={(e) => {
            e.stopPropagation();
            navigator.clipboard.writeText(voteAccount);
            toast.success('Address copied to clipboard');
          }}
          className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          title="Copy address"
        >
          <Copy className="h-3 w-3" />
        </button>
        <a
          href={`${explorerUrl}/address/${voteAccount}`}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          title="View on explorer"
        >
          <ExternalLink className="h-3 w-3" />
        </a>
      </div>
      {showIdentity && metadata?.identity && (
        <div className="flex items-center gap-1">
          <span className="text-xs text-muted-foreground">Identity:</span>
          <code className="flex-1 break-all rounded bg-muted px-1.5 py-0.5 text-xs">
            {metadata.identity}
          </code>
          <button
            onClick={(e) => {
              e.stopPropagation();
              navigator.clipboard.writeText(metadata.identity!);
              toast.success('Address copied to clipboard');
            }}
            className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            title="Copy address"
          >
            <Copy className="h-3 w-3" />
          </button>
          <a
            href={`${explorerUrl}/address/${metadata.identity}`}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            title="View on explorer"
          >
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      )}
    </div>
  );
};
