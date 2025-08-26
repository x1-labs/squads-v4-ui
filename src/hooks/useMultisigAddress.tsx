import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import { useSquadConfig } from './useSquadConfig';
import { useEffect } from 'react';

const MULTISIG_STORAGE_KEY = 'x-multisig-v4';

const getMultisigAddress = () => {
  if (typeof window !== 'undefined') {
    return localStorage.getItem(MULTISIG_STORAGE_KEY) || null;
  }
  return null;
};

export const useMultisigAddress = () => {
  const queryClient = useQueryClient();
  const { selectedAddress, addSquad } = useSquadConfig();

  const { data: multisigAddress } = useSuspenseQuery({
    queryKey: [MULTISIG_STORAGE_KEY, selectedAddress],
    queryFn: async () => {
      // First check if we have a selected squad from config
      if (selectedAddress) {
        return selectedAddress;
      }
      // Otherwise fall back to the old storage key for backwards compatibility
      const oldAddress = getMultisigAddress();
      // If we have an old address but no squad config, migrate it
      if (oldAddress && !selectedAddress) {
        // Don't auto-migrate, let user explicitly add it
        return null;
      }
      return oldAddress;
    },
  });

  // Sync selected squad address with multisig address
  useEffect(() => {
    if (selectedAddress && selectedAddress !== multisigAddress) {
      queryClient.setQueryData([MULTISIG_STORAGE_KEY], selectedAddress);
    }
  }, [selectedAddress, multisigAddress, queryClient]);

  const setMultisigAddress = useMutation({
    mutationFn: async (newAddress: string | null) => {
      if (newAddress) {
        localStorage.setItem(MULTISIG_STORAGE_KEY, newAddress);
        // Optionally add to saved squads if not already there
        addSquad.mutate({
          address: newAddress,
          name: `Squad ${newAddress.slice(0, 4)}...${newAddress.slice(-4)}`,
        });
      } else {
        localStorage.removeItem(MULTISIG_STORAGE_KEY); // Remove if null
      }
      return newAddress;
    },
    onSuccess: (newAddress) => {
      queryClient.setQueryData([MULTISIG_STORAGE_KEY], newAddress);
    },
  });

  return { multisigAddress, setMultisigAddress };
};
