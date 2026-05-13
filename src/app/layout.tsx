import "./globals.css";
import "@fontsource-variable/mona-sans/index.css";
import "@fortawesome/fontawesome-free/css/all.min.css";
import type { Metadata } from "next";
import { ClientProviders } from "./ClientProviders";

export const metadata: Metadata = {
  title: "AICW Issue Wallet",
  description: "Standalone app to issue AICW wallets",
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
