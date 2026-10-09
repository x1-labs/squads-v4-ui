import { useId, type ReactNode } from 'react';

/**
 * Shows why the wrapped button is disabled. A disabled Button ignores pointer
 * events and cannot get focus, so the wrapper takes focus and shows the reason
 * on hover and on focus. The reason also describes the wrapper for screen
 * readers.
 */
export function DisabledReason({ reason, children }: { reason?: string; children: ReactNode }) {
  const id = useId();
  if (!reason) {
    return <>{children}</>;
  }
  return (
    <span
      tabIndex={0}
      aria-describedby={id}
      className="group relative inline-flex cursor-not-allowed rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {children}
      <span
        id={id}
        role="tooltip"
        className="pointer-events-none invisible absolute bottom-full left-1/2 z-50 mb-1 w-max max-w-xs -translate-x-1/2 rounded-md border bg-popover px-2 py-1 text-xs text-popover-foreground shadow-md group-focus-within:visible group-hover:visible"
      >
        {reason}
      </span>
    </span>
  );
}
