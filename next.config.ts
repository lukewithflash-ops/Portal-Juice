import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: { root: process.cwd() },
  // The push image reads its brand font from disk.
  outputFileTracingIncludes: { "/api/push/img": ["./src/app/api/push/img/*.ttf"] },
  async redirects() {
    return [{ source: "/", destination: "/lines", permanent: false }];
  },
};

export default nextConfig;
