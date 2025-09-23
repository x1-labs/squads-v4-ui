import { useEffect, useRef } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { useSquadConfig } from '@/hooks/useSquadConfig';
import { useMultisigData } from '@/hooks/useMultisigData';
import { getEnvSquads } from '@/lib/envSquads';
import * as multisig from '@sqds/multisig';
import { PublicKey } from '@solana/web3.js';
import { SavedSquad } from '@/types/squad';

export function AutoAddEnvSquads() {
  const { publicKey } = useWallet();
  const { connection } = useMultisigData();
  const { addSquad, squads } = useSquadConfig();
  const hasCheckedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!publicKey || !connection) return;
    
    // Prevent checking the same wallet multiple times
    const walletKey = publicKey.toBase58();
    if (hasCheckedRef.current === walletKey) return;
    hasCheckedRef.current = walletKey;

    const checkAndAddEnvSquads = async () => {
      try {
        // Get the X1_ env squads
        const envSquads = getEnvSquads().filter(squad => 
          squad.name.includes('X1')
        );
        
        console.log(`Checking ${envSquads.length} X1 env squads for wallet ${walletKey}`);

        for (const envSquad of envSquads) {
          // Check if this squad is already in saved squads
          const alreadySaved = squads.some(
            (saved: SavedSquad) => saved.address === envSquad.address
          );

          if (alreadySaved) continue;

          try {
            // Fetch the multisig account
            const multisigPubkey = new PublicKey(envSquad.address);
            const multisigAccount = await multisig.accounts.Multisig.fromAccountAddress(
              connection as any, // Type casting to handle Connection type mismatch
              multisigPubkey
            );

            // Check if the connected wallet is a member
            const isMember = multisigAccount.members.some(
              member => member.key.toBase58() === publicKey.toBase58()
            );

            if (isMember) {
              console.log(`Auto-adding ${envSquad.name} - user is a member`);
              addSquad.mutate({
                address: envSquad.address,
                name: envSquad.name
              });
            }
          } catch (error) {
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
  }, [publicKey, connection, addSquad]); // Remove squads from dependencies to prevent loops

  return null;
}