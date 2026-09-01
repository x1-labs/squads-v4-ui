import { useEffect, useRef } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { useSquadConfig } from '@/hooks/useSquadConfig';
import { useMultisigData } from '@/hooks/useMultisigData';
import { useNetwork } from '@/hooks/useNetwork';
import { getEnvSquads } from '@/lib/envSquads';
import { isAccountNotFoundError } from '@/lib/network';
import * as multisig from '@sqds/multisig';
import { PublicKey } from '@solana/web3.js';
import { SavedSquad } from '@/types/squad';

export function AutoAddEnvSquads() {
  const { publicKey } = useWallet();
  const { connection } = useMultisigData();
  const { network } = useNetwork();
  const { addSquad, squads } = useSquadConfig();
  const hasCheckedRef = useRef<string | null>(null);

  useEffect(() => {
    // Wait for the network. Acting before detection resolves would check
    // addresses against a cluster we have not identified yet.
    if (!publicKey || !connection || !network) return;

    // Keyed by wallet and network, so switching RPC re-runs the check. A squad
    // absent from one cluster may exist on another.
    const checkKey = `${publicKey.toBase58()}:${network.id}`;
    if (hasCheckedRef.current === checkKey) return;
    hasCheckedRef.current = checkKey;

    const checkAndAddEnvSquads = async () => {
      try {
        // Every env squad is a candidate. Filtering by name cannot work: the
        // label is identical across networks, so it carries no cluster
        // information. The on-chain lookup below decides instead.
        const envSquads = getEnvSquads();

        for (const envSquad of envSquads) {
          const alreadySaved = squads.some(
            (saved: SavedSquad) => saved.address === envSquad.address
          );
          if (alreadySaved) continue;

          try {
            const multisigPubkey = new PublicKey(envSquad.address);
            const multisigAccount = await multisig.accounts.Multisig.fromAccountAddress(
              connection as any, // Type casting to handle Connection type mismatch
              multisigPubkey
            );

            const isMember = multisigAccount.members.some(
              (member) => member.key.toBase58() === publicKey.toBase58()
            );

            if (isMember) {
              addSquad.mutate({ address: envSquad.address, name: envSquad.name });
            }
          } catch (error) {
            if (isAccountNotFoundError(error)) {
              // The squad belongs to another chain. The build inlines one set
              // of addresses while the RPC is user-configurable, so the two
              // routinely disagree. Expected, not a failure.
              console.debug(
                `${envSquad.name} (${envSquad.address}) is not on ${network.name}, skipping`
              );
              continue;
            }
            console.error(`Failed to check membership for ${envSquad.name}:`, error);
          }
        }
      } catch (error) {
        console.error('Error auto-adding env squads:', error);
      }
    };

    // Small delay to ensure wallet is fully connected
    const timer = setTimeout(checkAndAddEnvSquads, 500);
    return () => clearTimeout(timer);
  }, [publicKey, connection, network, addSquad]); // Omit squads to prevent loops

  return null;
}
