import { useAccess } from '@/hooks/useAccess';
import { useWallet } from '@solana/wallet-adapter-react';

export function MembershipWarning() {
  const isMember = useAccess();
  const { connected } = useWallet();

  // Don't show warning if connected and is a member
  if (connected && isMember) {
    return null;
  }

  return (
    <div className="mb-2 flex items-center gap-2 rounded-md border border-orange-500/50 bg-orange-500/20 p-2">
      <svg
        className="h-4 w-4 flex-shrink-0 text-orange-500"
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
      <div className="flex-1">
        <p className="text-xs font-medium text-orange-600 dark:text-orange-400">
          {!connected ? 'Connect wallet to interact' : 'View-only (not a member)'}
        </p>
      </div>
    </div>
  );
}
