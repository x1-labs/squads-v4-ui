import { TokenList } from '@/components/TokenList';
import { VaultDisplayer } from '@/components/VaultDisplayer';
import { StakingPanel } from '@/components/StakingPanel';
import { useMultisigData } from '@/hooks/useMultisigData';
import { useMultisig } from '@/hooks/useServices';
import { toast } from 'sonner';

export default function Overview() {
  const { multisigAddress } = useMultisigData();
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

  const handleCopyAddress = () => {
    if (multisigAddress) {
      navigator.clipboard.writeText(multisigAddress);
      toast.success('Squad address copied to clipboard');
    }
  };

  return (
    <main>
      <div className="space-y-6">
        {/* Header Section */}
        <div className="border-b border-border pb-4">
          <h1 className="mb-3 text-2xl font-bold sm:text-3xl">Squad Overview</h1>
          {multisigAddress && (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm text-muted-foreground">Multisig Address:</span>
                <div className="flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-1.5">
                  <code className="font-mono text-sm text-foreground">
                    {multisigAddress.slice(0, 8)}...{multisigAddress.slice(-8)}
                  </code>
                  <button
                    onClick={handleCopyAddress}
                    className="flex-shrink-0 rounded p-1 transition-colors hover:bg-background"
                    title="Copy full address"
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
              <div className="border-warning/30 bg-warning/10 flex items-start gap-2 rounded-md border p-2">
                <svg
                  className="text-warning mt-0.5 h-4 w-4 flex-shrink-0"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                  />
                </svg>
                <p className="text-warning text-xs">
                  Do not send funds directly to this address. Use the vault addresses shown below
                  for deposits.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Content Sections */}
        {multisigAddress && (
          <>
            <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
              <VaultDisplayer />
              <TokenList multisigPda={multisigAddress} />
            </div>
            
            {/* Staking Section */}
            <div className="mt-6">
              <StakingPanel />
            </div>
          </>
        )}
      </div>
    </main>
  );
}
