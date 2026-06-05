import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "AICW Explorer — On-chain AI Wallets",
  description:
    "Browse issued AICW wallets on Solana devnet — heartbeat, wills, regions, and decision logs.",
};

export default function ExplorerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
