import { useQuery } from '@tanstack/react-query';
import { useMultisigData } from '@/hooks/useMultisigData';
import { fetchValidatorsByWithdrawAuthority, ValidatorInfo } from '@/lib/validators/validatorUtils';

export function useValidators(enabled: boolean = false) {
  const { connection, multisigVault } = useMultisigData();

  return useQuery<ValidatorInfo[]>({
    queryKey: ['validators', multisigVault?.toBase58()],
    queryFn: async () => {
      if (!multisigVault) return [];
      return await fetchValidatorsByWithdrawAuthority(connection, multisigVault);
    },
    enabled: !!multisigVault && enabled,
    // Increase cache time since validator data doesn't change frequently
    staleTime: 5 * 60 * 1000, // Consider data fresh for 5 minutes
    gcTime: 10 * 60 * 1000, // Keep in cache for 10 minutes (formerly cacheTime)
    refetchInterval: false, // Don't auto-refetch
    refetchOnWindowFocus: false, // Don't refetch on window focus
  });
}