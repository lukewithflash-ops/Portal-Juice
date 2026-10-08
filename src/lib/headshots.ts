/**
 * Headshot policy: a face renders only when the URL host is on the licensed
 * allowlist (licensed feed CDN or a league-approved headshot host).
 * No Instagram, no Google Images, no random CDN, no scraped faces.
 *
 * Configure with LICENSED_HEADSHOT_HOSTS="cdn.feed.example,img.league.example".
 * Empty by default → every card shows the team mark.
 */
const BLOCKED = [
  "instagram.com",
  "cdninstagram.com",
  "fbcdn.net",
  "google.com",
  "googleusercontent.com",
  "gstatic.com",
  "pinterest.com",
  "pinimg.com",
  "twimg.com",
];

export function licensedHosts(): string[] {
  const raw = process.env.LICENSED_HEADSHOT_HOSTS ?? "";
  return raw
    .split(",")
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
}

export function allowedHeadshot(
  url: string | null | undefined,
  hosts: string[] = licensedHosts()
): string | null {
  if (!url) return null;
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  if (u.protocol !== "https:") return null;
  const host = u.hostname.toLowerCase();
  if (BLOCKED.some((b) => host === b || host.endsWith(`.${b}`))) return null;
  if (!hosts.some((h) => host === h || host.endsWith(`.${h}`))) return null;
  return u.toString();
}
