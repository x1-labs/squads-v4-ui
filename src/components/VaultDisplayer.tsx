'use client';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { VaultSelector } from './VaultSelector';
import { useMultisigData } from '~/hooks/useMultisigData';
import { toast } from 'sonner';

type VaultDisplayerProps = {};

export function VaultDisplayer({}: VaultDisplayerProps) {
  const { multisigVault: vaultAddress } = useMultisigData();

  const handleCopyVaultAddress = () => {
    if (vaultAddress) {
      navigator.clipboard.writeText(vaultAddress.toBase58());
      toast.success('Vault address copied to clipboard');
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle>Vault</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">Vault Address</label>
            <div className="flex items-center gap-2">
              <code className="flex-1 break-all rounded bg-muted px-2 py-1 font-mono text-sm">
                {vaultAddress?.toBase58()}
              </code>
              <button
                onClick={handleCopyVaultAddress}
                className="flex-shrink-0 rounded p-1.5 transition-colors hover:bg-muted"
                title="Copy vault address"
              >
                <svg
                  className="h-4 w-4 text-muted-foreground hover:text-foreground"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                  />
                </svg>
              </button>
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">Select Vault</label>
            <VaultSelector />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
