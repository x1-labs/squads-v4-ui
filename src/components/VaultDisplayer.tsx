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
            <label className="text-xs text-muted-foreground mb-1 block">Vault Address</label>
            <div className="flex items-center gap-2">
              <code className="text-sm font-mono bg-muted px-2 py-1 rounded flex-1 break-all">
                {vaultAddress?.toBase58()}
              </code>
              <button
                onClick={handleCopyVaultAddress}
                className="p-1.5 hover:bg-muted rounded transition-colors flex-shrink-0"
                title="Copy vault address"
              >
                <svg className="w-4 h-4 text-muted-foreground hover:text-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              </button>
            </div>
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Select Vault</label>
            <VaultSelector />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
