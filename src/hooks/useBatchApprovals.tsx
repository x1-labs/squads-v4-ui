import { createContext, useContext, useState, useCallback, useMemo, ReactNode } from 'react';

export interface BatchApprovalItem {
  id: string;
  transactionIndex: number;
  proposalStatus: string;
  label: string;
}

interface BatchApprovalsContextType {
  items: BatchApprovalItem[];
  addItem: (item: Omit<BatchApprovalItem, 'id'>) => boolean;
  removeItem: (id: string) => void;
  clearAll: () => void;
  itemCount: number;
  hasItem: (transactionIndex: number) => boolean;
}

const BatchApprovalsContext = createContext<BatchApprovalsContextType | null>(null);

let nextId = 1;

export function BatchApprovalsProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<BatchApprovalItem[]>([]);

  const addItem = useCallback((item: Omit<BatchApprovalItem, 'id'>): boolean => {
    let added = false;
    setItems((prev) => {
      // Don't add duplicates
      if (prev.some((i) => i.transactionIndex === item.transactionIndex)) {
        return prev;
      }
      const id = `approval-${nextId++}-${Date.now()}`;
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
    <BatchApprovalsContext.Provider
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
    </BatchApprovalsContext.Provider>
  );
}

export function useBatchApprovals() {
  const context = useContext(BatchApprovalsContext);
  if (!context) {
    throw new Error('useBatchApprovals must be used within a BatchApprovalsProvider');
  }
  return context;
}
