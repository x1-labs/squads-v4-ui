import { useQuery } from '@tanstack/react-query';
import { getValidatorMetadata, ValidatorMetadata } from '@/lib/staking/validatorMetadata';
import { useMultisigData } from './useMultisigData';

export function useValidatorMetadata(voteAccount?: string) {
  const { connection } = useMultisigData();

  return useQuery<ValidatorMetadata | null>({
    queryKey: ['validatorMetadata', voteAccount],
    queryFn: async () => {
      if (!voteAccount) return null;
      return getValidatorMetadata(voteAccount, connection);
    },
    enabled: !!voteAccount,
    staleTime: 1000 * 60 * 60, // Cache for 1 hour
  });
}

export function useValidatorsMetadata(voteAccounts: string[]) {
  const { connection } = useMultisigData();

  return useQuery<Map<string, ValidatorMetadata>>({
    queryKey: ['validatorsMetadata', voteAccounts],
    queryFn: async () => {
      const metadataMap = new Map<string, ValidatorMetadata>();

      // Fetch all metadata in parallel
      const promises = voteAccounts.map(async (voteAccount) => {
        const metadata = await getValidatorMetadata(voteAccount, connection);
        return { voteAccount, metadata };
      });

      const results = await Promise.all(promises);
      results.forEach(({ voteAccount, metadata }) => {
        metadataMap.set(voteAccount, metadata);
      });

      return metadataMap;
    },
    enabled: voteAccounts.length > 0,
    staleTime: 1000 * 60 * 60, // Cache for 1 hour
  });
}
