import { useEffect, useState } from 'react';
import { clockTimerDelay } from '@/lib/spendingLimits';

/**
 * Current Unix time in seconds. Re-renders every `intervalMs`, and also at
 * `wakeAtSeconds` when that comes first. Uses the browser clock.
 */
export function useNow(intervalMs: number, wakeAtSeconds: number | null = null): number {
  const [now, setNow] = useState(() => Date.now() / 1000);

  // `now` is a dependency, so each timer sets the next one.
  useEffect(() => {
    const id = setTimeout(
      () => setNow(Date.now() / 1000),
      clockTimerDelay(Date.now(), intervalMs, wakeAtSeconds)
    );
    return () => clearTimeout(id);
  }, [intervalMs, wakeAtSeconds, now]);

  return now;
}
