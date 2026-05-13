"use client";

import { Toaster } from "react-hot-toast";
import { SolanaProviders } from "../components/SolanaProviders";

export function ClientProviders({ children }: { children: React.ReactNode }) {
  return (
    <SolanaProviders>
      {children}
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
              primary: "rgba(229, 231, 235, 0.58)",
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
    </SolanaProviders>
  );
}
