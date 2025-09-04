import { TokenList } from '@/components/TokenList';
import { VaultDisplayer } from '@/components/VaultDisplayer';
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
          <h1 className="mb-4 text-3xl font-bold">Overview</h1>
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
          <h1 className="mb-3 text-3xl font-bold">Squad Overview</h1>
          {multisigAddress && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-muted-foreground">Address:</span>
              <div className="flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-1.5">
                <code className="break-all font-mono text-sm text-foreground lg:break-normal">
                  <span className="hidden lg:inline">{multisigAddress}</span>
                  <span className="lg:hidden">
                    {multisigAddress.slice(0, 8)}...{multisigAddress.slice(-8)}
                  </span>
                </code>
                <button
                  onClick={handleCopyAddress}
                  className="flex-shrink-0 rounded p-1 transition-colors hover:bg-background"
                  title="Copy address"
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
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
            <VaultDisplayer />
            <TokenList multisigPda={multisigAddress} />
          </div>
        )}
      </div>
    </main>
  );
}
