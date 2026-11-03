import type { NextConfig } from "next";

// Every page and data file is prerendered at build time from the seed and feed files; the only
// code that runs per request is /api/ask (Claude-written answers, off until a key is set).
const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // /api/ask builds its search index from data/ at runtime; bundle those files with the function.
  outputFileTracingIncludes: { "/api/ask": ["./data/**/*"] },
};

export default nextConfig;
