import { useQuery } from '@tanstack/react-query';
import { useConnection } from '@solana/wallet-adapter-react';
import { PublicKey } from '@solana/web3.js';
import { fetchValidatorInfo, ValidatorInfo } from '@/lib/validators/validatorUtils';

export function useValidatorInfo(votePubkey: PublicKey | null) {
  const { connection } = useConnection();

  return useQuery<ValidatorInfo | null>({
    queryKey: ['validator', votePubkey?.toBase58()],
    queryFn: async () => {
      if (!votePubkey) return null;
      return await fetchValidatorInfo(connection, votePubkey);
    },
    enabled: !!votePubkey,
    refetchInterval: 30000,
    staleTime: 15000,
  });
}