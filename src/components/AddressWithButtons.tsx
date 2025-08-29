import React from 'react';
import { Copy, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import { useExplorerUrl } from '../hooks/useSettings';

interface AddressWithButtonsProps {
  address: string;
  label: string;
}

export const AddressWithButtons: React.FC<AddressWithButtonsProps> = ({ address, label }) => {
  const { explorerUrl } = useExplorerUrl();

  const handleCopyAddress = (address: string) => {
    navigator.clipboard.writeText(address);
    toast.success('Address copied to clipboard');
  };

  const getExplorerUrl = (address: string) => {
    return `${explorerUrl}/address/${address}`;
  };

  return (
    <div className="grid grid-cols-[80px,1fr] gap-2">
      <span className="text-muted-foreground">{label}:</span>
      <div className="flex items-center gap-1">
        <code className="flex-1 break-all rounded bg-muted px-1.5 py-0.5 text-xs">{address}</code>
        <button
          onClick={(e) => {
            e.stopPropagation();
            handleCopyAddress(address);
          }}
          className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          title="Copy address"
        >
          <Copy className="h-3 w-3" />
        </button>
        <a
          href={getExplorerUrl(address)}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          title="View on explorer"
        >
          <ExternalLink className="h-3 w-3" />
        </a>
      </div>
    </div>
  );
};
