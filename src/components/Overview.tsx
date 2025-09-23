import { TokenList } from '@/components/TokenList';
import { StakingPanel } from '@/components/staking/StakingPanel';
import { ValidatorStakePanel } from '@/components/staking/ValidatorStakePanel';
import { useMultisigData } from '@/hooks/useMultisigData';
import { useMultisig } from '@/hooks/useServices';
import { toast } from 'sonner';

export default function Overview() {
  const { multisigAddress, multisigVault, vaultIndex } = useMultisigData();
  const { data: multisigAccount } = useMultisig();

  // Only render components if we have a valid multisig account
  if (!multisigAccount) {
    return (
      <main>
        <div>
          <h1 className="mb-4 text-2xl font-bold sm:text-3xl">Overview</h1>
          <div className="py-8 text-center">
            <p className="text-muted-foreground">
              Invalid or non-existent multisig account. Please select a valid squad.
            </p>
          </div>
        </div>
      </main>
    );
  }

  const handleCopyVaultAddress = () => {
    if (multisigVault) {
      navigator.clipboard.writeText(multisigVault.toBase58());
      toast.success('Vault address copied to clipboard');
    }
  };

  return (
    <main>
      <div className="space-y-6">
        {/* Header Section */}
        <div className="border-b border-border pb-4">
          <h1 className="mb-3 text-2xl font-bold sm:text-3xl">Squad Overview</h1>
          {multisigVault && (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <span className="text-sm text-muted-foreground">Vault Address:</span>
              <div className="flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-1.5">
                <code className="break-all font-mono text-xs sm:text-sm text-foreground">
                  {multisigVault.toBase58()}
                </code>
                <button
                  onClick={handleCopyVaultAddress}
                  className="flex-shrink-0 rounded p-1 transition-colors hover:bg-background"
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
          )}
        </div>

        {/* Content Sections */}
        {multisigAddress && (
          <>
            <TokenList multisigPda={multisigAddress} />

            {/* Staking Section */}
            <div className="mt-6 space-y-6">
              <StakingPanel />
              <ValidatorStakePanel />
            </div>
          </>
        )}
      </div>
    </main>
  );
}
