import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import { SavedSquad, SquadConfig } from '../types/squad';
import { mergeEnvSquadsWithSaved, isEnvSquad } from '../lib/envSquads';

const SQUADS_STORAGE_KEY = 'x-squads-config';

const getSquadConfig = (): SquadConfig => {
  let savedSquads: SavedSquad[] = [];
  let selectedSquad: string | null = null;
  
  if (typeof window !== 'undefined') {
    const stored = localStorage.getItem(SQUADS_STORAGE_KEY);
    if (stored) {
      try {
        const config = JSON.parse(stored);
        savedSquads = config.squads || [];
        selectedSquad = config.selectedSquad || null;
      } catch (e) {
        console.error('Failed to parse squad config:', e);
      }
    }
  }
  
  // Merge environment squads with saved squads
  const mergedSquads = mergeEnvSquadsWithSaved(savedSquads);
  
  return { squads: mergedSquads, selectedSquad };
};

const saveSquadConfig = (config: SquadConfig) => {
  if (typeof window !== 'undefined') {
    // Only save non-env squads to localStorage
    const userSquads = config.squads.filter(squad => !isEnvSquad(squad));
    const configToSave = {
      squads: userSquads,
      selectedSquad: config.selectedSquad,
    };
    localStorage.setItem(SQUADS_STORAGE_KEY, JSON.stringify(configToSave));
  }
};

export const useSquadConfig = () => {
  const queryClient = useQueryClient();

  const { data: squadConfig } = useSuspenseQuery({
    queryKey: ['squadConfig'],
    queryFn: () => Promise.resolve(getSquadConfig()),
  });

  const addSquad = useMutation({
    mutationFn: async (squad: Omit<SavedSquad, 'addedAt'>) => {
      const config = getSquadConfig();
      const newSquad: SavedSquad = {
        ...squad,
        addedAt: Date.now(),
      };
      
      // Check if squad already exists
      const existingIndex = config.squads.findIndex((s: SavedSquad) => s.address === squad.address);
      if (existingIndex >= 0) {
        config.squads[existingIndex] = newSquad;
      } else {
        config.squads.push(newSquad);
      }
      
      // If no squad is selected, select this one
      if (!config.selectedSquad) {
        config.selectedSquad = newSquad.address;
      }
      
      saveSquadConfig(config);
      return config;
    },
    onSuccess: (config) => {
      queryClient.setQueryData(['squadConfig'], config);
    },
  });

  const removeSquad = useMutation({
    mutationFn: async (address: string) => {
      const config = getSquadConfig();
      
      // Find the squad to remove
      const squadToRemove = config.squads.find((s: SavedSquad) => s.address === address);
      
      // Don't allow removing env squads
      if (squadToRemove && isEnvSquad(squadToRemove)) {
        console.warn('Cannot remove environment-configured squad');
        return config;
      }
      
      config.squads = config.squads.filter((s: SavedSquad) => s.address !== address);
      
      // If we removed the selected squad, select the first one or null
      if (config.selectedSquad === address) {
        config.selectedSquad = config.squads.length > 0 ? config.squads[0].address : null;
      }
      
      saveSquadConfig(config);
      return config;
    },
    onSuccess: (config) => {
      queryClient.setQueryData(['squadConfig'], config);
    },
  });

  const selectSquad = useMutation({
    mutationFn: async (address: string | null) => {
      const config = getSquadConfig();
      config.selectedSquad = address;
      saveSquadConfig(config);
      return config;
    },
    onSuccess: (config) => {
      queryClient.setQueryData(['squadConfig'], config);
      // Invalidate multisig queries to refresh with new address
      queryClient.invalidateQueries({ queryKey: ['multisig'] });
    },
  });

  const updateSquad = useMutation({
    mutationFn: async ({ address, updates }: { address: string; updates: Partial<Omit<SavedSquad, 'address' | 'addedAt'>> }) => {
      const config = getSquadConfig();
      const squadIndex = config.squads.findIndex((s: SavedSquad) => s.address === address);
      
      if (squadIndex >= 0) {
        config.squads[squadIndex] = {
          ...config.squads[squadIndex],
          ...updates,
        };
        saveSquadConfig(config);
      }
      
      return config;
    },
    onSuccess: (config) => {
      queryClient.setQueryData(['squadConfig'], config);
    },
  });

  const selectedSquad = squadConfig.squads.find((s: SavedSquad) => s.address === squadConfig.selectedSquad);

  return {
    squads: squadConfig.squads,
    selectedSquad,
    selectedAddress: squadConfig.selectedSquad,
    addSquad,
    removeSquad,
    selectSquad,
    updateSquad,
    isEnvSquad,
  };
};