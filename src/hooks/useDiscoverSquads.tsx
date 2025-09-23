import { useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { PublicKey } from '@solana/web3.js';
import * as multisig from '@sqds/multisig';
import { useMultisigData } from './useMultisigData';

export interface DiscoveredSquad {
  address: string;
  threshold: number;
  memberCount: number;
  createKey: string;
  configAuthority: string | null;
  timeLock: number;
  transactionIndex: number;
  staleTransactionIndex: number;
}

export const useDiscoverSquads = () => {
  const [isScanning, setIsScanning] = useState(false);
  const [discoveredSquads, setDiscoveredSquads] = useState<DiscoveredSquad[]>([]);
  const [error, setError] = useState<string | null>(null);
  const { publicKey } = useWallet();
  const { connection, programId } = useMultisigData();

  const scanForSquads = async () => {
    if (!publicKey) {
      setError('Please connect your wallet first');
      return;
    }

    setIsScanning(true);
    setError(null);
    setDiscoveredSquads([]);

    try {
      console.log(`Scanning for squads with program ID: ${programId.toBase58()}`);
      console.log(`RPC URL: ${connection.rpcEndpoint}`);
      
      // First, let's test with a known squad if provided in the environment
      // This helps us understand the account structure
      const testAddresses = [
        '7SHZXoDtzBastoJBWpGanDnvngcFftxSfnuSZffAh4Fw',
        'Eu2AYLo3USjePZA7PyscUtY8vmsP6G2UHBGbDBPGfRgb',
      ];
      
      for (const addr of testAddresses) {
        try {
          const testPubkey = new PublicKey(addr);
          const testAccount = await connection.getAccountInfo(testPubkey);
          if (testAccount && testAccount.owner.equals(programId)) {
            console.log(`Test account ${addr} size: ${testAccount.data.length} bytes`);
          }
        } catch (e) {
          // Ignore test failures
        }
      }
      
      // Now we know multisigs are around 495 bytes (for 2 members)
      // Each member adds 64 bytes, so we can filter by size
      // Size = 367 + (members * 64)
      const sizesToCheck = [
        431, // 1 member: 367 + 64
        495, // 2 members: 367 + 128
        559, // 3 members: 367 + 192
        623, // 4 members: 367 + 256
        687, // 5 members: 367 + 320
      ];

      const allAccounts: any[] = [];
      
      // Fetch accounts by size to avoid getting too many
      for (const size of sizesToCheck) {
        try {
          const accounts = await connection.getProgramAccounts(programId, {
            commitment: 'confirmed',
            filters: [
              {
                dataSize: size,
              },
            ],
          });
          console.log(`Found ${accounts.length} accounts with size ${size}`);
          allAccounts.push(...accounts);
        } catch (err) {
          console.debug(`No accounts with size ${size}`);
        }
      }

      console.log(`Found ${allAccounts.length} potential multisig accounts`);

      const userSquads: DiscoveredSquad[] = [];
      const seenAddresses = new Set<string>();
      let checkedCount = 0;
      let multisigCount = 0;

      // Process accounts in small batches to avoid blocking
      for (let i = 0; i < allAccounts.length; i++) {
        const account = allAccounts[i];
        const address = account.pubkey.toBase58();
        if (seenAddresses.has(address)) continue;
        seenAddresses.add(address);

        checkedCount++;
        
        try {
          // Try to decode as a multisig account
          // @ts-ignore
          const multisigAccount = await multisig.accounts.Multisig.fromAccountAddress(
            connection as any,
            account.pubkey
          );
          
          multisigCount++;
          
          // Check if the connected wallet is a member
          const isMember = multisigAccount.members.some(
            (member: any) => member.key.equals(publicKey)
          );

          if (isMember) {
            console.log(`Found squad where user is member: ${address}`);
            userSquads.push({
              address,
              threshold: multisigAccount.threshold,
              memberCount: multisigAccount.members.length,
              createKey: multisigAccount.createKey.toBase58(),
              configAuthority: multisigAccount.configAuthority?.toBase58() || null,
              timeLock: multisigAccount.timeLock,
              transactionIndex: Number(multisigAccount.transactionIndex),
              staleTransactionIndex: Number(multisigAccount.staleTransactionIndex),
            });
          }
        } catch (err) {
          // Not a multisig account, skip silently
        }
        
        // Add a small delay every 10 accounts to prevent blocking
        if (i > 0 && i % 10 === 0) {
          await new Promise(resolve => setTimeout(resolve, 10));
        }
      }

      console.log(`Checked ${checkedCount} accounts, found ${multisigCount} multisigs`);
      console.log(`Found ${userSquads.length} squads for wallet ${publicKey.toBase58()}`);
      setDiscoveredSquads(userSquads);
    } catch (err) {
      console.error('Error scanning for squads:', err);
      setError('Failed to scan for squads. Please try again.');
    } finally {
      setIsScanning(false);
    }
  };

  return {
    scanForSquads,
    isScanning,
    discoveredSquads,
    error,
  };
};