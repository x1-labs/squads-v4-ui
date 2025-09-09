import { useQuery } from '@tanstack/react-query';
import { PublicKey } from '@solana/web3.js';
import { useMultisigData } from './useMultisigData';
import { useMultisig } from './useServices';
import * as multisig from '@sqds/multisig';
import { getStakeAccountsForVault, StakeAccountInfo } from '@/lib/staking/validatorStakeUtils';

export function useStakeAccounts(vaultIndex: number = 0) {
  const { connection, programId, multisigAddress } = useMultisigData();
  const { data: multisigAccount } = useMultisig();

  return useQuery({
    queryKey: ['stakeAccounts', multisigAddress, vaultIndex],
    queryFn: async (): Promise<StakeAccountInfo[]> => {
      if (!multisigAddress || !multisigAccount) {
        return [];
      }

      const vaultPda = multisig.getVaultPda({
        index: vaultIndex,
        multisigPda: new PublicKey(multisigAddress),
        programId: programId ? new PublicKey(programId) : multisig.PROGRAM_ID,
      })[0];

      return getStakeAccountsForVault(connection, vaultPda);
    },
    enabled: !!multisigAddress && !!multisigAccount,
    refetchInterval: 30000,
  });
}
