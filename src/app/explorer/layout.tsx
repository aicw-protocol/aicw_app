import type { Metadata } from "next";
import { getClusterLabel } from "../../lib/solanaCluster";

const NETWORK = getClusterLabel();

export const metadata: Metadata = {
  title: "AICW Explorer — On-chain AI Wallets",
  description: `Browse issued AICW wallets on Solana ${NETWORK.toLowerCase()} — heartbeat, wills, regions, and decision logs.`,
};

export default function ExplorerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
