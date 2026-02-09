'use client';
import React, { FC, useMemo, useEffect, useState } from 'react';
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';
import {
  TorusWalletAdapter,
  LedgerWalletAdapter,
} from '@solana/wallet-adapter-wallets';
import { getRpcUrl } from '@/hooks/useSettings';

import '@solana/wallet-adapter-react-ui/styles.css';

type Props = {
  children?: React.ReactNode;
};

export const Wallet: FC<Props> = ({ children }) => {
  const [walletsReady, setWalletsReady] = useState(false);

  // Use the same RPC URL configured in app settings (localStorage).
  // This ensures the wallet adapter connects to the same network the app is using,
  // so users don't have to manually switch networks in their wallet.
  const endpoint = useMemo(() => getRpcUrl(), []);

  // Delay wallet initialization to allow browser extensions to register
  useEffect(() => {
    // Give browser extensions time to inject and register with the wallet standard
    const timer = setTimeout(() => {
      setWalletsReady(true);
    }, 100);

    return () => clearTimeout(timer);
  }, []);

  const wallets = useMemo(
    () => {
      if (!walletsReady) return [];

      // Wallets that support the Wallet Standard (Phantom, Solflare, Backpack, etc.)
      // are detected automatically and don't need legacy adapter registration.
      // Only include adapters for wallets that don't implement the standard.
      return [
        new TorusWalletAdapter(),
        new LedgerWalletAdapter(),
      ];
    },
    [walletsReady]
  );

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>{children}</WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
};
