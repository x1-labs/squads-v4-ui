import { useQuery, useQueries, useQueryClient } from '@tanstack/react-query';
import { useMultisigData } from '@/hooks/useMultisigData';
import { fetchValidatorInfo, ValidatorInfo } from '@/lib/validators/validatorUtils';
import { useKnownValidators } from './useKnownValidators';
import { PublicKey } from '@solana/web3.js';
import { useEffect } from 'react';

// This hook fetches only specific validators that we know about
// Much faster than scanning all validators on the network
export function useValidatorsOptimized() {
  const { connection, multisigVault } = useMultisigData();
  const { knownValidators } = useKnownValidators();
  const queryClient = useQueryClient();

  // Force re-render when knownValidators changes
  useEffect(() => {
    // Invalidate all validator queries to trigger refetch
    if (knownValidators.length > 0) {
      queryClient.invalidateQueries({ queryKey: ['validator'] });
    }
  }, [knownValidators.length, queryClient]);

  // Create queries for each known validator
  const validatorQueries = useQueries({
    queries: knownValidators.map((validator: any) => ({
      queryKey: ['validator', validator.votePubkey],
      queryFn: async () => {
        try {
          const votePubkey = new PublicKey(validator.votePubkey);
          const info = await fetchValidatorInfo(connection, votePubkey);
          
          // Verify this validator belongs to our multisig
          if (info && multisigVault && info.withdrawAuthority.equals(multisigVault)) {
            return info;
          }
          return null;
        } catch (e) {
          console.error(`Error fetching validator ${validator.votePubkey}:`, e);
          return null;
        }
      },
      enabled: !!multisigVault,
      staleTime: 5 * 60 * 1000,
      gcTime: 10 * 60 * 1000,
    })),
  });

  // Combine results
  const validators = validatorQueries
    .map(q => q.data)
    .filter((v): v is ValidatorInfo => v !== null);

  const isLoading = validatorQueries.some(q => q.isLoading);
  const error = validatorQueries.find(q => q.error)?.error;

  return {
    data: validators,
    isLoading,
    error,
  };
}

// Hook to add a validator by vote account
export function useAddValidator() {
  const { connection, multisigVault } = useMultisigData();
  const { addKnownValidator } = useKnownValidators();
  const queryClient = useQueryClient();

  const addValidator = async (votePubkeyString: string): Promise<boolean> => {
    if (!multisigVault) {
      throw new Error('No multisig vault selected');
    }

    try {
      const votePubkey = new PublicKey(votePubkeyString);
      const info = await fetchValidatorInfo(connection, votePubkey);
      
      if (!info) {
        throw new Error('Validator not found');
      }
      
      if (!info.withdrawAuthority.equals(multisigVault)) {
        throw new Error('This validator is not controlled by your Squad');
      }
      
      // Add to known validators
      addKnownValidator(votePubkeyString);
      
      // Invalidate validator queries to trigger refetch
      await queryClient.invalidateQueries({ queryKey: ['validator'] });
      
      return true;
    } catch (e) {
      console.error('Error adding validator:', e);
      throw e;
    }
  };

  return { addValidator };
}