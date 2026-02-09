import { createContext, useContext, useState, useCallback, ReactNode } from 'react';

export interface BatchExecuteItem {
  id: string;
  transactionIndex: number;
  label: string;
}

interface BatchExecutesContextType {
  items: BatchExecuteItem[];
  addItem: (item: Omit<BatchExecuteItem, 'id'>) => boolean;
  removeItem: (id: string) => void;
  clearAll: () => void;
  itemCount: number;
  hasItem: (transactionIndex: number) => boolean;
}

const BatchExecutesContext = createContext<BatchExecutesContextType | null>(null);

let nextId = 1;

export function BatchExecutesProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<BatchExecuteItem[]>([]);

  const addItem = useCallback((item: Omit<BatchExecuteItem, 'id'>): boolean => {
    let added = false;
    setItems((prev) => {
      if (prev.some((i) => i.transactionIndex === item.transactionIndex)) {
        return prev;
      }
      const id = `execute-${nextId++}-${Date.now()}`;
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

  const hasItem = useCallback(
    (transactionIndex: number) => items.some((i) => i.transactionIndex === transactionIndex),
    [items]
  );

  return (
    <BatchExecutesContext.Provider
      value={{
        items,
        addItem,
        removeItem,
        clearAll,
        itemCount: items.length,
        hasItem,
      }}
    >
      {children}
    </BatchExecutesContext.Provider>
  );
}

export function useBatchExecutes() {
  const context = useContext(BatchExecutesContext);
  if (!context) {
    throw new Error('useBatchExecutes must be used within a BatchExecutesProvider');
  }
  return context;
}
