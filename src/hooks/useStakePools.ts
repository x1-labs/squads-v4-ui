import { useQuery } from '@tanstack/react-query';
import { PublicKey } from '@solana/web3.js';
import { useMultisigData } from './useMultisigData';
import { getStakePoolsForDisplay, StakePoolInfo } from '../lib/staking/stakePoolUtils';
import * as multisig from '@sqds/multisig';

export function useStakePools() {
  const { connection, multisigAddress, vaultIndex, programId } = useMultisigData();

  return useQuery({
    queryKey: ['stakePools', multisigAddress, vaultIndex],
    queryFn: async (): Promise<StakePoolInfo[]> => {
      if (!multisigAddress || vaultIndex === undefined) {
        return [];
      }

      try {
        // Get the vault address
        const vaultAddress = multisig.getVaultPda({
          index: vaultIndex,
          multisigPda: new PublicKey(multisigAddress),
          programId: programId ? new PublicKey(programId) : multisig.PROGRAM_ID,
        })[0];

        // Fetch stake pools with user balances
        const pools = await getStakePoolsForDisplay(connection, vaultAddress);

        return pools;
      } catch (error) {
        console.error('Error fetching stake pools:', error);
        return [];
      }
    },
    enabled: !!multisigAddress && vaultIndex !== undefined,
    refetchInterval: 30000, // Refetch every 30 seconds
  });
}

export function useTotalStaked() {
  const { data: stakePools } = useStakePools();

  if (!stakePools) return 0;

  return stakePools.reduce((total, pool) => {
    return total + (pool.userBalance || 0);
  }, 0);
}
