export const SITE_NAME = "Portal Juice";
export const TAGLINE = "The number moved.";
export const FOOTER_LINE =
  "Lines and prices only. Portal Juice is not a book and does not take the other side.";
export const PAST_HITS = "Past hits are not a pick.";

/** Canonical URL. portaljuice.app is the live site; env can override it. */
export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://portaljuice.app";

export const NAV = [
  { href: "/lines", label: "Lines" },
  { href: "/best", label: "Best" },
  { href: "/games", label: "Games" },
  { href: "/props", label: "Props" },
  { href: "/mvp", label: "MVP" },
  { href: "/trends", label: "Trends" },
  { href: "/news", label: "News" },
  { href: "/lines/board", label: "Board" },
  { href: "/lines/portfolio", label: "Log" },
  { href: "/app", label: "App" },
] as const;
