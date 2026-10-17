import type { NextConfig } from "next";

/** One id per deploy: the open app compares it with the server's and reloads onto the new build. */
const BUILD_ID = process.env.VERCEL_GIT_COMMIT_SHA || process.env.VERCEL_DEPLOYMENT_ID || String(Date.now());

const nextConfig: NextConfig = {
  turbopack: { root: process.cwd() },
  env: { NEXT_PUBLIC_BUILD_ID: BUILD_ID },
  async headers() {
    return [
      // The service worker and manifest are always re-checked, so an installed app never holds an old one.
      { source: "/sw.js", headers: [{ key: "Cache-Control", value: "no-cache, no-store, must-revalidate" }] },
      { source: "/api/version", headers: [{ key: "Cache-Control", value: "no-store" }] },
    ];
  },
  // The push image reads its brand font from disk.
  outputFileTracingIncludes: {
    "/api/push/img": ["./src/app/api/push/img/*.ttf"],
    "/api/final/[league]/[id]": ["./src/app/api/push/img/*.ttf"],
    "/api/nightly": ["./src/app/api/push/img/*.ttf"],
  },
  async redirects() {
    // Section aliases for the five tabs. Every older URL still has its own page.
    const alias: [string, string][] = [
      ["/home", "/lines"],
      ["/log", "/lines/portfolio"],
      ["/picks", "/lines/portfolio"],
      ["/parlays", "/lines/portfolio"],
      ["/portfolio", "/lines/portfolio"],
      ["/stats", "/lines/stats"],
      ["/board", "/lines/board"],
      ["/squads", "/friends"],
      ["/threads", "/friends"],
      ["/profile", "/more"],
      ["/settings", "/account"],
      ["/help", "/ask"],
      ["/team", "/more"],
    ];
    return [
      { source: "/", destination: "/lines", permanent: false },
      ...alias.map(([source, destination]) => ({ source, destination, permanent: false })),
    ];
  },
};

export default nextConfig;
