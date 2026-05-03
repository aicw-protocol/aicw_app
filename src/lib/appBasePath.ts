/**
 * Client-side prefix for `public/` URLs. Must match `basePath` in `next.config.js`
 * (GitHub Project Pages: `/aicw_app`). Set `NEXT_PUBLIC_BASE_PATH` at build time when it
 * differs (e.g. empty for `npm run build:root-static`).
 */
export function appBasePath(): string {
  const v = process.env.NEXT_PUBLIC_BASE_PATH;
  if (v !== undefined) return v;
  if (process.env.NODE_ENV === "production") return "/aicw_app";
  return "";
}
