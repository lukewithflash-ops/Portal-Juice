export const SITE_NAME = "Portal Juice";
export const TAGLINE = "The number moved.";
export const FOOTER_LINE =
  "Lines and prices only. Portal Juice is not a book and does not take the other side.";
export const PAST_HITS = "Past hits are not a pick.";

/**
 * Canonical URL comes from env only. portaljuice.com is registered to a third
 * party (not on our Vercel account) and portaljuice.io is someone else's, so
 * nothing is hard-coded until the domain is ours.
 */
export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || null;

export const NAV = [
  { href: "/lines", label: "Lines" },
  { href: "/lines/board", label: "Board" },
  { href: "/lines/portfolio", label: "Log" },
] as const;
