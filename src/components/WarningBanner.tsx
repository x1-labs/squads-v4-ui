import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { useWallet } from '@solana/wallet-adapter-react';
import { useMultisigAddress } from '@/hooks/useMultisigAddress';
import { useQuery } from '@tanstack/react-query';
import * as multisig from '@sqds/multisig';
import { Connection, PublicKey } from '@solana/web3.js';
import { useMultisigData } from '@/hooks/useMultisigData';
import { isMember } from '@/lib/utils';

export const WarningBanner: React.FC = () => {
  const { connected, publicKey } = useWallet();
  const { multisigAddress } = useMultisigAddress();
  const { connection } = useMultisigData();

  // Use regular useQuery instead of useSuspenseQuery to avoid suspense issues
  const { data: multisigData } = useQuery({
    queryKey: ['multisig-banner', multisigAddress],
    queryFn: async () => {
      if (!multisigAddress) return null;
      try {
        const multisigPubkey = new PublicKey(multisigAddress);
        const accountInfo = await connection.getAccountInfo(multisigPubkey);
        if (!accountInfo) {
          return null;
        }
        // @ts-ignore
        return multisig.accounts.Multisig.fromAccountAddress(connection, multisigPubkey);
      } catch (error) {
        console.error('Error fetching multisig for banner:', error);
        return null;
      }
    },
    enabled: !!multisigAddress,
  });

  // Don't show banner if no multisig is selected
  if (!multisigAddress || !multisigData) {
    return null;
  }

  const hasAccess = publicKey && multisigData ? isMember(publicKey, multisigData.members) : false;

  // Don't show any banner if wallet is connected and user has access
  if (connected && hasAccess) {
    return null;
  }

  return (
    <div className="w-full">
      {!connected && (
        <div className="flex items-center gap-2 bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 px-4 py-3 rounded-lg mb-4">
          <AlertTriangle className="h-5 w-5 flex-shrink-0" />
          <div className="text-sm font-medium">
            Wallet not connected. Connect your wallet to interact with this multisig.
          </div>
        </div>
      )}
      
      {connected && !hasAccess && (
        <div className="flex items-center gap-2 bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 px-4 py-3 rounded-lg mb-4">
          <AlertTriangle className="h-5 w-5 flex-shrink-0" />
          <div className="text-sm font-medium">
            You are not a member of this multisig. You can view but not interact with it.
          </div>
        </div>
      )}
    </div>
  );
};