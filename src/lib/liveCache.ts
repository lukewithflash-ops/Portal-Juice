/**
 * Live reads: the browser never caches; Vercel's edge shares one copy for 1 second (and may hand out that copy
 * for 1 more second while it fetches the next), so a crowd on one game makes about one ESPN call a second.
 * The client never steps backwards (isBehind), so a stale copy only repeats, never rewinds.
 */
export const LIVE_HEADERS = {
  "Cache-Control": "no-store, max-age=0",
  "CDN-Cache-Control": "public, max-age=1, stale-while-revalidate=1",
  "Vercel-CDN-Cache-Control": "public, max-age=1, stale-while-revalidate=1",
} as const;
