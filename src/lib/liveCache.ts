/**
 * Live reads: the browser never caches; Vercel's edge may share one copy for 2 seconds
 * so a crowd on one game doesn't fan out to ESPN. No stale-while-revalidate.
 */
export const LIVE_HEADERS = {
  "Cache-Control": "no-store, max-age=0",
  "CDN-Cache-Control": "public, max-age=2",
  "Vercel-CDN-Cache-Control": "public, max-age=2",
} as const;
