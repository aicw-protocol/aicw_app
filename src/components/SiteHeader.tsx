"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { AppNav } from "./AppNav";

const WalletMultiButton = dynamic(
  () => import("@solana/wallet-adapter-react-ui").then((mod) => mod.WalletMultiButton),
  { ssr: false },
);

interface SiteHeaderProps {
  isNavMenuOpen: boolean;
  onMenuToggle: (open: boolean) => void;
  showWallet?: boolean;
}

export function SiteHeader({ isNavMenuOpen, onMenuToggle, showWallet = false }: SiteHeaderProps) {
  return (
    <header className="top-nav">
      <div className="top-nav-inner">
        <div className="top-nav-left">
          <Link href="/" className="brand brand-link">
            <div className="brand-title">
              AICW <span className="brand-chain">ON SOLANA</span>
            </div>
          </Link>
        </div>
        <div className="top-nav-center">
          <AppNav isMenuOpen={isNavMenuOpen} onMenuToggle={onMenuToggle} />
        </div>
        <div className="top-nav-right">
          {showWallet ? <WalletMultiButton /> : null}
          <button
            type="button"
            className="hamburger-btn"
            onClick={() => onMenuToggle(!isNavMenuOpen)}
            aria-label="Toggle menu"
            aria-expanded={isNavMenuOpen}
          >
            <i className={`fa-solid ${isNavMenuOpen ? "fa-times" : "fa-bars"}`} />
          </button>
        </div>
      </div>
    </header>
  );
}
