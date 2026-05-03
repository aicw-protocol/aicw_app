import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Explorer | AICW",
  description: "Browse issued AICW wallets on-chain",
};

export default function ExplorerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
