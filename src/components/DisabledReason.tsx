import type { ReactNode } from 'react';

/**
 * Shows why the wrapped button is disabled, as a tooltip. A disabled Button
 * ignores pointer events, so the wrapper must carry the title. Screen readers
 * get the same text.
 */
export function DisabledReason({ reason, children }: { reason?: string; children: ReactNode }) {
  if (!reason) {
    return <>{children}</>;
  }
  return (
    <span title={reason} className="inline-flex cursor-not-allowed">
      {children}
      <span className="sr-only">{reason}</span>
    </span>
  );
}
