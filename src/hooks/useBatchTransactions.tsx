import { createContext, useContext, useState, useCallback, ReactNode } from 'react';
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

export const DEFAULT_BATCH_LIMIT = 3;

interface BatchTransactionsContextType {
  items: BatchItem[];
  addItem: (item: Omit<BatchItem, 'id'>) => boolean;
  removeItem: (id: string) => void;
  clearAll: () => void;
  itemCount: number;
  maxItems: number;
  isFull: boolean;
  remaining: number;
}

const BatchTransactionsContext = createContext<BatchTransactionsContextType | null>(null);

let nextId = 1;

export function BatchTransactionsProvider({
  children,
  maxItems = DEFAULT_BATCH_LIMIT,
}: {
  children: ReactNode;
  maxItems?: number;
}) {
  const [items, setItems] = useState<BatchItem[]>([]);

  const addItem = useCallback(
    (item: Omit<BatchItem, 'id'>): boolean => {
      let added = false;
      setItems((prev) => {
        if (prev.length >= maxItems) return prev;
        const id = `batch-${nextId++}-${Date.now()}`;
        added = true;
        return [...prev, { ...item, id }];
      });
      return added;
    },
    [maxItems]
  );

  const removeItem = useCallback((id: string) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const clearAll = useCallback(() => {
    setItems([]);
  }, []);

  const itemCount = items.length;

  return (
    <BatchTransactionsContext.Provider
      value={{
        items,
        addItem,
        removeItem,
        clearAll,
        itemCount,
        maxItems,
        isFull: itemCount >= maxItems,
        remaining: Math.max(0, maxItems - itemCount),
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
