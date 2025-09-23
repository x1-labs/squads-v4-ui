'use client';
import React, { FC, useMemo, useEffect, useState } from 'react';
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react';
import { WalletAdapterNetwork } from '@solana/wallet-adapter-base';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';
import { clusterApiUrl } from '@solana/web3.js';
import {
  PhantomWalletAdapter,
  SolflareWalletAdapter,
  TorusWalletAdapter,
  LedgerWalletAdapter,
} from '@solana/wallet-adapter-wallets';
import { BackpackWalletAdapter } from '@solana/wallet-adapter-backpack';

import '@solana/wallet-adapter-react-ui/styles.css';

type Props = {
  children?: React.ReactNode;
};

export const Wallet: FC<Props> = ({ children }) => {
  const network = WalletAdapterNetwork.Devnet;
  const [walletsReady, setWalletsReady] = useState(false);

  const endpoint = useMemo(() => clusterApiUrl(network), [network]);

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
      
      const adapters: any[] = [
        new PhantomWalletAdapter(),
        new SolflareWalletAdapter(),
        new TorusWalletAdapter(),
        new LedgerWalletAdapter(),
      ];
      
      // Add Backpack adapter as fallback if it's not auto-detected via wallet standard
      // Check if window.backpack exists (indicates extension is installed)
      if (typeof window !== 'undefined' && (window as any).backpack?.solana) {
        adapters.push(new BackpackWalletAdapter());
      }
      
      return adapters;
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
