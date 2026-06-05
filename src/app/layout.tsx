import "./globals.css";
import "@fontsource-variable/mona-sans/index.css";
import "@fortawesome/fontawesome-free/css/all.min.css";
import type { Metadata } from "next";
import { ClientProviders } from "./ClientProviders";

export const metadata: Metadata = {
  metadataBase: new URL("https://wallet.aicw.ai"),
  title: "AICW Issue Wallet — Devnet AI Agent Wallet",
  description:
    "Issue an AI-controlled wallet on Solana devnet. On-chain heartbeat, wills, and MPC signing for autonomous agents.",
  openGraph: {
    title: "AICW Issue Wallet",
    description: "Devnet AI agent wallet issuance for the AICW protocol",
    url: "https://wallet.aicw.ai/",
    siteName: "AICW Wallet",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <ClientProviders>{children}</ClientProviders>
      </body>
    </html>
  );
}
