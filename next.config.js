/** @type {import('next').NextConfig} */
const isProd = process.env.NODE_ENV === "production";

const nextConfig = {
  reactStrictMode: true,
  output: "export",
  // Must match GitHub repo name for Project Pages: https://aicw-protocol.github.io/aicw_app/
  basePath: isProd ? "/aicw_app" : "",
  assetPrefix: isProd ? "/aicw_app/" : "",
  images: { unoptimized: true },
};

module.exports = nextConfig;
