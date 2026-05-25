/** Public document & asset URLs (GitHub Pages production defaults). */
export const AICW_PUBLIC_ORIGIN =
  process.env.NEXT_PUBLIC_AICW_PUBLIC_ORIGIN?.trim() ||
  "https://aicw-protocol.github.io/aicw_app";

export const AICW_SKILL_MD_URL =
  process.env.NEXT_PUBLIC_AICW_SKILL_MD_URL?.trim() ||
  `${AICW_PUBLIC_ORIGIN}/aicw_skill.md`;

/** Human-facing setup page (styled UI). */
export const AICW_SETUP_PAGE_URL =
  process.env.NEXT_PUBLIC_AICW_SETUP_PAGE_URL?.trim() ||
  `${AICW_PUBLIC_ORIGIN}/setup`;

/** @deprecated Use AICW_SETUP_PAGE_URL for humans; kept for Copy/env alias. */
export const AICW_MCP_SETUP_MD_URL =
  process.env.NEXT_PUBLIC_AICW_MCP_SETUP_MD_URL?.trim() || AICW_SETUP_PAGE_URL;

export const AICW_MCP_DOWNLOAD_URL =
  process.env.NEXT_PUBLIC_AICW_MCP_DOWNLOAD_URL?.trim() ||
  `${AICW_PUBLIC_ORIGIN}/aicw_mcp-release.zip`;
