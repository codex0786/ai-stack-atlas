import type { NextConfig } from "next";

// Static export: every page is pre-rendered from the seed files at build time, so the
// deployed site is plain HTML/JS with no server or database.
const nextConfig: NextConfig = {
  output: "export",
  reactStrictMode: true,
  poweredByHeader: false,
};

export default nextConfig;
