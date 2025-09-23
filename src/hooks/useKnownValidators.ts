import { useState, useEffect } from 'react';
import { useMultisigData } from '@/hooks/useMultisigData';

interface KnownValidator {
  votePubkey: string;
  name?: string;
}

// Global state to share across all components
let globalValidators: KnownValidator[] = [];
let globalListeners: Array<(validators: KnownValidator[]) => void> = [];

export function useKnownValidators() {
  const { multisigVault } = useMultisigData();
  const [knownValidators, setKnownValidators] = useState<KnownValidator[]>(globalValidators);

  // Subscribe to global changes
  useEffect(() => {
    const listener = (validators: KnownValidator[]) => {
      setKnownValidators(validators);
    };
    globalListeners.push(listener);
    
    return () => {
      globalListeners = globalListeners.filter(l => l !== listener);
    };
  }, []);

  // Load known validators from localStorage
  useEffect(() => {
    if (!multisigVault) {
      // Clear validators when no vault is selected
      globalValidators = [];
      setKnownValidators([]);
      globalListeners.forEach(listener => listener([]));
      return;
    }
    
    const storageKey = `known_validators_${multisigVault.toBase58()}`;
    const stored = localStorage.getItem(storageKey);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        globalValidators = parsed;
        setKnownValidators(parsed);
        // Notify all listeners
        globalListeners.forEach(listener => listener(parsed));
      } catch (e) {
        console.error('Failed to parse known validators:', e);
        // Reset on error
        globalValidators = [];
        setKnownValidators([]);
        globalListeners.forEach(listener => listener([]));
      }
    } else {
      // No stored validators for this vault, reset
      globalValidators = [];
      setKnownValidators([]);
      globalListeners.forEach(listener => listener([]));
    }
  }, [multisigVault]);

  // Save known validators to localStorage
  const saveKnownValidators = (validators: KnownValidator[]) => {
    if (!multisigVault) return;
    
    const storageKey = `known_validators_${multisigVault.toBase58()}`;
    localStorage.setItem(storageKey, JSON.stringify(validators));
    globalValidators = validators;
    // Notify all listeners
    globalListeners.forEach(listener => listener(validators));
  };

  // Add a known validator
  const addKnownValidator = (votePubkey: string, name?: string) => {
    const newValidator = { votePubkey, name };
    const updated = [...globalValidators, newValidator];
    saveKnownValidators(updated);
  };

  return {
    knownValidators,
    addKnownValidator,
  };
}