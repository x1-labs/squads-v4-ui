import { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { useMultisigData } from './useMultisigData';

/** Max cancels in a single transaction (each adds ~47 bytes; ~20 fit) */
export const MAX_BATCH_CANCELS = 12;

export interface BatchCancelItem {
  id: string;
  /**
   * The queue outlives navigation and Settings changes, and a transaction index
   * only means something within one multisig, on one network, under one
   * program. Canceling at threshold is final, so every item records all three
   * (see scopeKey) and is only ever shown or sent under the same ones.
   */
  scope: string;
  multisigPda: string;
  transactionIndex: number;
  label: string;
}

type NewItem = Omit<BatchCancelItem, 'id' | 'scope'>;

const scopeKey = (rpcUrl: string, programId: string, multisigPda: string) =>
  `${rpcUrl}|${programId}|${multisigPda}`;

interface BatchCancelsStore {
  items: BatchCancelItem[];
  addItems: (items: Omit<BatchCancelItem, 'id'>[]) => number;
  removeItems: (ids: string[]) => void;
  clearScope: (scope: string) => void;
}

const BatchCancelsContext = createContext<BatchCancelsStore | null>(null);

let nextId = 1;

function merge(
  prev: BatchCancelItem[],
  incoming: Omit<BatchCancelItem, 'id'>[]
): BatchCancelItem[] {
  const next = [...prev];
  for (const item of incoming) {
    const sameScope = next.filter((i) => i.scope === item.scope);
    if (sameScope.some((i) => i.transactionIndex === item.transactionIndex)) continue;
    if (sameScope.length >= MAX_BATCH_CANCELS) continue;
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

  const removeItems = useCallback((ids: string[]) => {
    const drop = new Set(ids);
    setItems((prev) => prev.filter((item) => !drop.has(item.id)));
  }, []);

  const clearScope = useCallback((scope: string) => {
    setItems((prev) => prev.filter((item) => item.scope !== scope));
  }, []);

  return (
    <BatchCancelsContext.Provider value={{ items, addItems, removeItems, clearScope }}>
      {children}
    </BatchCancelsContext.Provider>
  );
}

/**
 * The cancel queue for the current network and program (the RPC URL and
 * program ID the panel reads and sends with). Items queued under other Settings
 * stay in the store but are invisible here until those Settings come back.
 */
export function useBatchCancels() {
  const store = useContext(BatchCancelsContext);
  if (!store) {
    throw new Error('useBatchCancels must be used within a BatchCancelsProvider');
  }
  const { rpcUrl, programId } = useMultisigData();
  const program = programId.toBase58();
  const scopeOf = (multisigPda: string) => scopeKey(rpcUrl, program, multisigPda);

  /** Queue several at once; returns how many were added (skips duplicates, stops at the cap). */
  const addItems = (items: NewItem[]) =>
    store.addItems(items.map((item) => ({ ...item, scope: scopeOf(item.multisigPda) })));

  const itemsFor = (multisigPda: string) =>
    store.items.filter((i) => i.scope === scopeOf(multisigPda));

  return {
    addItem: (item: NewItem) => addItems([item]) === 1,
    addItems,
    removeItem: (id: string) => store.removeItems([id]),
    removeItems: store.removeItems,
    /** Drop every queued item for one multisig (under the current Settings). */
    clearMultisig: (multisigPda: string) => store.clearScope(scopeOf(multisigPda)),
    hasItem: (multisigPda: string, transactionIndex: number) =>
      itemsFor(multisigPda).some((i) => i.transactionIndex === transactionIndex),
    itemsFor,
  };
}
