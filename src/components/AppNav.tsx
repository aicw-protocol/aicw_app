"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AICW_SKILL_MD_URL } from "../lib/publicUrls";

interface AppNavProps {
  isMenuOpen: boolean;
  onMenuToggle: (open: boolean) => void;
}

export function AppNav({ isMenuOpen, onMenuToggle }: AppNavProps) {
  const pathname = usePathname();

  const closeAll = () => onMenuToggle(false);

  return (
    <>
      <nav className={`nav-menu ${isMenuOpen ? "nav-menu-open" : ""}`} aria-label="Main">
        <Link
          href="/"
          className="nav-menu-link"
          aria-current={pathname === "/" ? "page" : undefined}
          onClick={closeAll}
        >
          Issue Wallet
        </Link>
        <Link
          href="/explorer"
          className="nav-menu-link"
          aria-current={pathname === "/explorer" ? "page" : undefined}
          onClick={closeAll}
        >
          AICW Explorer
        </Link>
        <a
          href={AICW_SKILL_MD_URL}
          className="nav-menu-link"
          target="_blank"
          rel="noopener noreferrer"
          title="Agent skill document (Python + MPC bridge)"
          onClick={closeAll}
        >
          Agent Skill
        </a>
      </nav>

      {isMenuOpen && (
        <div className="nav-menu-overlay" onClick={() => onMenuToggle(false)} />
      )}
    </>
  );
}
