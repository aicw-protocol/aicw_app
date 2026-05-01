"use client";

import { useMemo } from "react";
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { WalletAdapterNetwork } from "@solana/wallet-adapter-base";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { PhantomWalletAdapter } from "@solana/wallet-adapter-phantom";
import { SolflareWalletAdapter } from "@solana/wallet-adapter-solflare";
import "@solana/wallet-adapter-react-ui/styles.css";

const RPC =
  process.env.NEXT_PUBLIC_SOLANA_RPC ?? "https://api.devnet.solana.com";

function walletAdapterNetwork(rpcUrl: string): WalletAdapterNetwork {
  const url = rpcUrl.toLowerCase();
  if (url.includes("mainnet")) return WalletAdapterNetwork.Mainnet;
  if (url.includes("testnet")) return WalletAdapterNetwork.Testnet;
  return WalletAdapterNetwork.Devnet;
}

export default function Providers({ children }: { children: React.ReactNode }) {
  const network = walletAdapterNetwork(RPC);
  const wallets = useMemo(
    () => [
      new PhantomWalletAdapter(),
      new SolflareWalletAdapter({ network }),
    ],
    [network],
  );

  return (
    <ConnectionProvider endpoint={RPC}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>{children}</WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
