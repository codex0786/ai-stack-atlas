import type { NextConfig } from "next";

// Every page and data file is prerendered at build time from the seed and feed files.
const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
};

export default nextConfig;
