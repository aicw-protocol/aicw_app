/** Public document URLs (GitHub Pages production defaults). */
export const AICW_PUBLIC_ORIGIN =
  process.env.NEXT_PUBLIC_AICW_PUBLIC_ORIGIN?.trim() ||
  "https://aicw-protocol.github.io/aicw_app";

export const AICW_SKILL_MD_URL =
  process.env.NEXT_PUBLIC_AICW_SKILL_MD_URL?.trim() ||
  `${AICW_PUBLIC_ORIGIN}/aicw_skill.md`;
