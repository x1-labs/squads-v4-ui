import { useEffect, useRef } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletReadyState } from '@solana/wallet-adapter-base';
import { LedgerWalletName, TorusWalletName } from '@solana/wallet-adapter-wallets';

// Legacy adapters whose `autoConnect()` falls back to a full `connect()` — i.e.
// it can pop an approval / hardware-device prompt. We must NOT silently re-fire
// those on tab focus or users would get surprise popups. Standard-Wallet
// adapters (Phantom, Solflare, Backpack, X1, …) override `autoConnect()` to
// connect with `{ silent: true }`, which reconnects only if the site is already
// trusted and otherwise no-ops — safe to fire freely.
const NON_SILENT_ADAPTERS = new Set<string>([LedgerWalletName, TorusWalletName]);

/**
 * Re-establishes a dropped wallet connection when the user returns to the tab.
 *
 * `WalletProvider`'s built-in `autoConnect` only runs once per mounted adapter
 * (its attempt flag resets only when the selected wallet changes, not on
 * disconnect). So if the wallet locks — or the tab is discarded/reloaded while
 * the wallet is locked — and is later unlocked, nothing re-links it: the user is
 * stranded on the Connect button until they click it.
 *
 * This hook watches for the tab regaining focus/visibility and, if a previously
 * selected wallet is sitting disconnected, retries the *silent* connect path.
 * Because it uses `adapter.autoConnect()` (trusted-only), it can never surface a
 * popup: it either reconnects invisibly or does nothing. Worst case is identical
 * to today's behavior, so it is safe to ship even where the bug can't be
 * reproduced.
 *
 * Must be rendered inside `<WalletProvider>`.
 */
export function useWalletAutoReconnect(): void {
  const { wallet, connected, connecting } = useWallet();
  // Guards against overlapping attempts when `focus` and `visibilitychange`
  // fire back-to-back (they usually do when switching back to the tab).
  const attemptingRef = useRef(false);

  useEffect(() => {
    // Nothing selected, already connected, or a connect is already in flight —
    // nothing to recover.
    if (!wallet || connected || connecting) return;

    const { adapter } = wallet;
    // Skip adapters whose silent path isn't actually silent (see above).
    if (NON_SILENT_ADAPTERS.has(adapter.name)) return;

    const tryReconnect = async () => {
      if (attemptingRef.current) return;
      // Only act when the tab is actually in the foreground and the wallet is
      // detected. A silent connect against a locked/absent wallet just rejects,
      // so there's nothing to gain by attempting it here.
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      if (adapter.connected) return;
      const { readyState } = adapter;
      if (readyState !== WalletReadyState.Installed && readyState !== WalletReadyState.Loadable) return;

      attemptingRef.current = true;
      try {
        await adapter.autoConnect();
      } catch {
        // Trusted-only connect failed (wallet still locked, trust revoked, …).
        // Expected — leave the user on the Connect button, exactly as before.
      } finally {
        attemptingRef.current = false;
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === 'visible') void tryReconnect();
    };
    const onFocus = () => void tryReconnect();

    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [wallet, connected, connecting]);
}
