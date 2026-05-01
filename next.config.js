/** @type {import('next').NextConfig} */
const isProd = process.env.NODE_ENV === "production";

const nextConfig = {
  reactStrictMode: true,
  output: "export",
  basePath: isProd ? "/aicw-app" : "",
  assetPrefix: isProd ? "/aicw-app/" : "",
  images: { unoptimized: true },
};

module.exports = nextConfig;
