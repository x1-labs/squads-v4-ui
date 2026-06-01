'use client';
import React, { FC, useCallback, useMemo } from 'react';
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';
import { WalletError } from '@solana/wallet-adapter-base';
import { TorusWalletAdapter, LedgerWalletAdapter } from '@solana/wallet-adapter-wallets';
import { getRpcUrl } from '@/hooks/useSettings';

import '@solana/wallet-adapter-react-ui/styles.css';

type Props = {
  children?: React.ReactNode;
};

export const Wallet: FC<Props> = ({ children }) => {
  // RPC endpoint for the wallet-adapter ConnectionProvider. Read once at mount.
  // The app's reactive connection (which follows RPC changes made in Settings)
  // lives in useMultisigData; this endpoint only backs the wallet-adapter context.
  const endpoint = useMemo(() => getRpcUrl(), []);

  // Wallets that implement the Wallet Standard (Phantom, Solflare, Backpack, …)
  // are detected automatically and must NOT be listed here. Only register legacy
  // adapters that don't implement the standard.
  //
  // This array must be referentially stable: swapping it after mount forces
  // WalletProvider to re-initialize and races with autoConnect, which is a
  // primary cause of spurious disconnects. (Previously this was delayed behind a
  // 100ms timer and went from [] -> [adapters]; that swap was the bug.)
  const wallets = useMemo(() => [new LedgerWalletAdapter(), new TorusWalletAdapter()], []);

  // autoConnect can surface benign errors (user hasn't authorized the site yet,
  // a wallet isn't ready, etc.). Swallow them as warnings instead of letting them
  // bubble up as uncaught errors / scary console noise.
  const onError = useCallback((error: WalletError) => {
    console.warn('[wallet-adapter]', error.name, error.message);
  }, []);

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} onError={onError} autoConnect>
        <WalletModalProvider>{children}</WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
};
