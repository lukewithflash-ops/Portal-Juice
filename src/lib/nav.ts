/** Five sections. Every older route still lives under one of them (nothing removed); sub-tabs sit inside. */
export type SectionId = "home" | "live" | "log" | "squads" | "more";
export type SubTab = { href: string; label: string; exact?: boolean };
export type Section = { id: SectionId; label: string; href: string; subs: SubTab[]; owns: string[] };

export const SECTIONS: Section[] = [
  {
    id: "home",
    label: "Home",
    href: "/lines",
    subs: [
      { href: "/lines", label: "Lines", exact: true },
      { href: "/vip", label: "💎 VIP" },
      { href: "/games", label: "Games" },
      { href: "/props", label: "Props" },
      { href: "/best", label: "Best" },
      { href: "/trends", label: "Trends" },
      { href: "/news", label: "News" },
      { href: "/mvp", label: "MVP" },
      { href: "/lines/board", label: "Board" },
    ],
    owns: ["/lines", "/vip", "/games", "/props", "/best", "/trends", "/news", "/mvp", "/lines/board", "/teams", "/sports"],
  },
  { id: "live", label: "Live", href: "/live", subs: [], owns: ["/live"] },
  {
    id: "log",
    label: "Log",
    href: "/lines/portfolio",
    subs: [
      { href: "/lines/portfolio", label: "Picks" },
      { href: "/lines/stats", label: "Stats" },
      { href: "/notes", label: "Notes" },
      { href: "/check", label: "Breakdown" },
    ],
    owns: ["/lines/portfolio", "/lines/stats", "/notes", "/check"],
  },
  {
    id: "squads",
    label: "Squads",
    href: "/friends",
    subs: [
      { href: "/friends", label: "Squads" },
      { href: "/leaders", label: "Leaders" },
    ],
    owns: ["/friends", "/leaders"],
  },
  { id: "more", label: "More", href: "/more", subs: [], owns: ["/more", "/account", "/quests", "/wrapped", "/widget", "/ask", "/app"] },
];

const under = (path: string, base: string) => path === base || path.startsWith(base + "/");

/** Which section a path belongs to. Longest owned prefix wins (/lines/portfolio is Log, /lines is Home). */
export function sectionOf(path: string): Section {
  let best: { s: Section; n: number } | null = null;
  for (const s of SECTIONS) for (const o of s.owns) if (under(path, o) && (!best || o.length > best.n)) best = { s, n: o.length };
  return best?.s ?? SECTIONS[0];
}

export function subActive(path: string, t: SubTab): boolean {
  return t.exact ? path === t.href : under(path, t.href) && !(t.href === "/lines" && path !== "/lines");
}
