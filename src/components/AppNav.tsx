"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { appBasePath } from "../lib/appBasePath";
import { AICW_SKILL_MD_URL } from "../lib/publicUrls";

interface AppNavProps {
  isMenuOpen: boolean;
  onMenuToggle: (open: boolean) => void;
}

export function AppNav({ isMenuOpen, onMenuToggle }: AppNavProps) {
  const pathname = usePathname();
  const [isDocsOpen, setIsDocsOpen] = useState(false);
  const docsRef = useRef<HTMLDivElement>(null);

  const skillHref = AICW_SKILL_MD_URL;
  const setupHref = `${appBasePath()}/setup`;

  const closeAll = useCallback(() => {
    setIsDocsOpen(false);
    onMenuToggle(false);
  }, [onMenuToggle]);

  useEffect(() => {
    if (!isDocsOpen) return;
    const onPointerDown = (e: MouseEvent) => {
      if (docsRef.current && !docsRef.current.contains(e.target as Node)) {
        setIsDocsOpen(false);
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [isDocsOpen]);

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
          Explorer
        </Link>
        <div className="nav-menu-dropdown" ref={docsRef}>
          <button
            type="button"
            className="nav-menu-link nav-menu-dropdown-trigger"
            aria-expanded={isDocsOpen}
            aria-haspopup="menu"
            onClick={() => setIsDocsOpen((open) => !open)}
          >
            Agent Setup
            <i
              className={`fa-solid fa-chevron-down nav-menu-dropdown-chevron${isDocsOpen ? " nav-menu-dropdown-chevron--open" : ""}`}
              aria-hidden="true"
            />
          </button>
          {isDocsOpen && (
            <div className="nav-menu-dropdown-panel" role="menu" aria-label="Agent setup documents">
              <a
                href={skillHref}
                className="nav-menu-dropdown-item"
                role="menuitem"
                target="_blank"
                rel="noopener noreferrer"
                title="Track A — skill document (Python + MPC bridge)"
                onClick={closeAll}
              >
                <span className="nav-menu-dropdown-track">Track A</span>
                aicw_skill.md
              </a>
              <a
                href={setupHref}
                className="nav-menu-dropdown-item"
                role="menuitem"
                title="Human setup guide (Track A + B)"
                onClick={closeAll}
              >
                <span className="nav-menu-dropdown-track">Track A &amp; B</span>
                Agent Setup page
              </a>
            </div>
          )}
        </div>
      </nav>

      {isMenuOpen && (
        <div className="nav-menu-overlay" onClick={() => onMenuToggle(false)} />
      )}
    </>
  );
}
