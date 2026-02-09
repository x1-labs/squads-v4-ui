import { createContext, useContext, useState, useCallback, useMemo, ReactNode } from 'react';
import { TransactionInstruction } from '@solana/web3.js';

export type BatchItemType =
  | 'unstake'
  | 'withdraw'
  | 'delegate'
  | 'split'
  | 'redelegate'
  | 'merge'
  | 'custom';

export interface BatchItem {
  id: string;
  type: BatchItemType;
  label: string;
  description: string;
  instructions: TransactionInstruction[];
  vaultIndex: number;
}

/** Max inner instructions that fit in a single vault transaction (2 delegates = 6 works, 3 = 9 fails) */
export const MAX_BATCH_INSTRUCTIONS = 6;

interface BatchTransactionsContextType {
  items: BatchItem[];
  addItem: (item: Omit<BatchItem, 'id'>) => boolean;
  removeItem: (id: string) => void;
  clearAll: () => void;
  itemCount: number;
  instructionCount: number;
  remainingInstructions: number;
}

const BatchTransactionsContext = createContext<BatchTransactionsContextType | null>(null);

let nextId = 1;

export function BatchTransactionsProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<BatchItem[]>([]);

  const addItem = useCallback((item: Omit<BatchItem, 'id'>): boolean => {
    let added = false;
    setItems((prev) => {
      const currentIxCount = prev.reduce((sum, i) => sum + i.instructions.length, 0);
      if (currentIxCount + item.instructions.length > MAX_BATCH_INSTRUCTIONS) return prev;
      const id = `batch-${nextId++}-${Date.now()}`;
      added = true;
      return [...prev, { ...item, id }];
    });
    return added;
  }, []);

  const removeItem = useCallback((id: string) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const clearAll = useCallback(() => {
    setItems([]);
  }, []);

  const instructionCount = useMemo(
    () => items.reduce((sum, item) => sum + item.instructions.length, 0),
    [items]
  );

  return (
    <BatchTransactionsContext.Provider
      value={{
        items,
        addItem,
        removeItem,
        clearAll,
        itemCount: items.length,
        instructionCount,
        remainingInstructions: Math.max(0, MAX_BATCH_INSTRUCTIONS - instructionCount),
      }}
    >
      {children}
    </BatchTransactionsContext.Provider>
  );
}

export function useBatchTransactions() {
  const context = useContext(BatchTransactionsContext);
  if (!context) {
    throw new Error('useBatchTransactions must be used within a BatchTransactionsProvider');
  }
  return context;
}
