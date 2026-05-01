import "./globals.css";
import "@fontsource-variable/mona-sans/index.css";
import "@fortawesome/fontawesome-free/css/all.min.css";
import { Toaster } from "react-hot-toast";
import type { Metadata } from "next";
import Providers from "./providers";

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
        <Providers>{children}</Providers>
        <Toaster
          position="top-right"
          toastOptions={{
            style: {
              background: "#000000",
              color: "#d1d5db",
              border: "1px solid #374151",
            },
            success: {
              iconTheme: {
                primary: "#9ca3af",
                secondary: "#111827",
              },
            },
            error: {
              iconTheme: {
                primary: "#f87171",
                secondary: "#111827",
              },
            },
          }}
        />
      </body>
    </html>
  );
}
