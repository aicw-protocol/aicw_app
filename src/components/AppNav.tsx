"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { appBasePath } from "../lib/appBasePath";

export function AppNav() {
  const pathname = usePathname();
  const skillHref = `${appBasePath()}/aicw_skill.md`;
  return (
    <nav className="nav-menu" aria-label="Main">
      <Link
        href="/"
        className="nav-menu-link"
        aria-current={pathname === "/" ? "page" : undefined}
      >
        Issue Wallet
      </Link>
      <Link
        href="/explorer"
        className="nav-menu-link"
        aria-current={pathname === "/explorer" ? "page" : undefined}
      >
        Explorer
      </Link>
      <a
        href={skillHref}
        className="nav-menu-link"
        target="_blank"
        rel="noopener noreferrer"
        title="AICW agent playbook (markdown)"
      >
        Agent Skill
      </a>
    </nav>
  );
}
