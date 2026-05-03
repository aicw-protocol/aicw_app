/** @type {import('next').NextConfig} */
const isProd = process.env.NODE_ENV === "production";

// GitHub Project Pages uses /aicw_app as the site root path. HTML references /aicw_app/_next/...
// Files in `out/` are still `out/_next/...`, so the host must map /aicw_app/* to that folder
// (same layout as the repo root on Pages), or use `npm run export:nested-preview` for local tests.
// Set NEXT_STATIC_BASE_PATH="" (empty) for a build served from `out/` at URL / (e.g. npx serve out).
function staticBasePath() {
  if (process.env.NEXT_STATIC_BASE_PATH !== undefined) {
    return process.env.NEXT_STATIC_BASE_PATH;
  }
  return isProd ? "/aicw_app" : "";
}

const base = staticBasePath();

const nextConfig = {
  reactStrictMode: true,
  output: "export",
  basePath: base,
  assetPrefix: base ? `${base}/` : "",
  images: { unoptimized: true },
};

module.exports = nextConfig;
