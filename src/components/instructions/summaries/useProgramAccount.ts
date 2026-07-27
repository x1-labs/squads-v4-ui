import { useEffect, useState } from 'react';

/**
 * Run an on-chain account read for an instruction summary, tracking loading
 * state and ignoring results that arrive after the summary has moved on.
 *
 * `key` identifies the account being read; pass a falsy key when there is
 * nothing to load. `load` may close over anything derived from that key — it is
 * deliberately not a dependency, so callers don't need to memoize it.
 */
export function useProgramAccount<T>(
  key: string | undefined | false,
  load: () => Promise<T | null>
): { data: T | null; loading: boolean } {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(Boolean(key));

  useEffect(() => {
    if (!key) {
      setData(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    load()
      .then((result) => {
        if (!cancelled) setData(result);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return { data, loading };
}
