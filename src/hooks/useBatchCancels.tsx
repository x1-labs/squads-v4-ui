import { createContext, useContext, useState, useCallback, ReactNode } from 'react';

/** Max cancels in a single transaction (each adds ~47 bytes; ~20 fit) */
export const MAX_BATCH_CANCELS = 12;

export interface BatchCancelItem {
  id: string;
  /**
   * The queue outlives navigation between multisigs, and a transaction index
   * only means something within one multisig. Canceling at threshold is
   * final, so every item records which multisig it belongs to.
   */
  multisigPda: string;
  transactionIndex: number;
  label: string;
}

interface BatchCancelsContextType {
  items: BatchCancelItem[];
  addItem: (item: Omit<BatchCancelItem, 'id'>) => boolean;
  /** Queue several at once; returns how many were added (skips duplicates, stops at the cap). */
  addItems: (items: Omit<BatchCancelItem, 'id'>[]) => number;
  removeItem: (id: string) => void;
  removeItems: (ids: string[]) => void;
  /** Drop every queued item for one multisig. */
  clearMultisig: (multisigPda: string) => void;
  hasItem: (multisigPda: string, transactionIndex: number) => boolean;
  itemsFor: (multisigPda: string) => BatchCancelItem[];
}

const BatchCancelsContext = createContext<BatchCancelsContextType | null>(null);

let nextId = 1;

function merge(
  prev: BatchCancelItem[],
  incoming: Omit<BatchCancelItem, 'id'>[]
): BatchCancelItem[] {
  const next = [...prev];
  for (const item of incoming) {
    const sameMultisig = next.filter((i) => i.multisigPda === item.multisigPda);
    if (sameMultisig.some((i) => i.transactionIndex === item.transactionIndex)) continue;
    if (sameMultisig.length >= MAX_BATCH_CANCELS) continue;
    next.push({ ...item, id: `cancel-${nextId++}-${Date.now()}` });
  }
  return next;
}

export function BatchCancelsProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<BatchCancelItem[]>([]);

  // The count comes from the current render's items rather than from inside
  // the updater, which React may run later, so callers get a reliable answer.
  const addItems = useCallback(
    (incoming: Omit<BatchCancelItem, 'id'>[]): number => {
      const added = merge(items, incoming).length - items.length;
      setItems((prev) => merge(prev, incoming));
      return added;
    },
    [items]
  );

  const addItem = useCallback(
    (item: Omit<BatchCancelItem, 'id'>): boolean => addItems([item]) === 1,
    [addItems]
  );

  const removeItem = useCallback((id: string) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const removeItems = useCallback((ids: string[]) => {
    const drop = new Set(ids);
    setItems((prev) => prev.filter((item) => !drop.has(item.id)));
  }, []);

  const clearMultisig = useCallback((multisigPda: string) => {
    setItems((prev) => prev.filter((item) => item.multisigPda !== multisigPda));
  }, []);

  const hasItem = useCallback(
    (multisigPda: string, transactionIndex: number) =>
      items.some((i) => i.multisigPda === multisigPda && i.transactionIndex === transactionIndex),
    [items]
  );

  const itemsFor = useCallback(
    (multisigPda: string) => items.filter((i) => i.multisigPda === multisigPda),
    [items]
  );

  return (
    <BatchCancelsContext.Provider
      value={{ items, addItem, addItems, removeItem, removeItems, clearMultisig, hasItem, itemsFor }}
    >
      {children}
    </BatchCancelsContext.Provider>
  );
}

export function useBatchCancels() {
  const context = useContext(BatchCancelsContext);
  if (!context) {
    throw new Error('useBatchCancels must be used within a BatchCancelsProvider');
  }
  return context;
}
