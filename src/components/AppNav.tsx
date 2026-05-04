"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { appBasePath } from "../lib/appBasePath";

interface AppNavProps {
  isMenuOpen: boolean;
  onMenuToggle: (open: boolean) => void;
}

export function AppNav({ isMenuOpen, onMenuToggle }: AppNavProps) {
  const pathname = usePathname();
  const skillHref = `${appBasePath()}/aicw_skill.md`;

  return (
    <>
      {/* Desktop menu - always visible on desktop */}
      <nav className={`nav-menu ${isMenuOpen ? "nav-menu-open" : ""}`} aria-label="Main">
        <Link
          href="/"
          className="nav-menu-link"
          aria-current={pathname === "/" ? "page" : undefined}
          onClick={() => onMenuToggle(false)}
        >
          Issue Wallet
        </Link>
        <Link
          href="/explorer"
          className="nav-menu-link"
          aria-current={pathname === "/explorer" ? "page" : undefined}
          onClick={() => onMenuToggle(false)}
        >
          Explorer
        </Link>
        <a
          href={skillHref}
          className="nav-menu-link"
          target="_blank"
          rel="noopener noreferrer"
          title="AICW agent playbook (markdown)"
          onClick={() => onMenuToggle(false)}
        >
          Agent Skill
        </a>
      </nav>

      {/* Overlay for mobile menu */}
      {isMenuOpen && (
        <div
          className="nav-menu-overlay"
          onClick={() => onMenuToggle(false)}
        />
      )}
    </>
  );
}
