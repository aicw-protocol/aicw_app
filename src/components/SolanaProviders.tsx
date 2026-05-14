"use client";

import { useMemo, useCallback } from "react";
import {
  ConnectionProvider,
  WalletProvider,
} from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { LedgerWalletAdapter } from "@solana/wallet-adapter-ledger";
import type { WalletError } from "@solana/wallet-adapter-base";

import "@solana/wallet-adapter-react-ui/styles.css";

const RPC_ENDPOINT =
  process.env.NEXT_PUBLIC_SOLANA_RPC ?? "https://api.devnet.solana.com";

export function SolanaProviders({ children }: { children: React.ReactNode }) {
  // Phantom, Solflare, Backpack 등 Wallet Standard 호환 지갑은 자동 감지됨.
  // Ledger처럼 Standard를 지원하지 않는 지갑만 명시적으로 등록.
  const wallets = useMemo(() => [new LedgerWalletAdapter()], []);

  const onError = useCallback((error: WalletError) => {
    console.error("Wallet error:", error);
  }, []);

  return (
    <ConnectionProvider endpoint={RPC_ENDPOINT}>
      <WalletProvider wallets={wallets} autoConnect onError={onError}>
        <WalletModalProvider>{children}</WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
