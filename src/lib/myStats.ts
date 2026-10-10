/** Your record from the Log. Wins, losses, pushes only: no money, no units. Pure. */
import { pickKind } from "@/lib/ledger";
import type { Pick } from "@/lib/types";

export type Tally = { w: number; l: number; p: number; open: number; pct: number | null };
export type Group = { key: string; t: Tally };

export function tally(ps: Pick[]): Tally {
  const w = ps.filter((p) => p.status === "win").length;
  const l = ps.filter((p) => p.status === "loss").length;
  const p = ps.filter((x) => x.status === "push").length;
  const open = ps.filter((x) => x.status === "open").length;
  return { w, l, p, open, pct: w + l ? Math.round((w / (w + l)) * 1000) / 10 : null };
}

function groupBy(ps: Pick[], key: (p: Pick) => string | null): Group[] {
  const m = new Map<string, Pick[]>();
  for (const p of ps) {
    const k = key(p);
    if (!k) continue;
    m.set(k, [...(m.get(k) ?? []), p]);
  }
  return [...m.entries()].map(([k, list]) => ({ key: k, t: tally(list) })).sort((a, b) => b.t.w + b.t.l - (a.t.w + a.t.l));
}

export function statType(p: Pick): string | null {
  if (pickKind(p) !== "prop") return null;
  const m = (p.market ?? "").toLowerCase().trim();
  return m || null;
}

const settled = (ps: Pick[]) => ps.filter((p) => p.status === "win" || p.status === "loss" || p.status === "push");
const when = (p: Pick) => p.date || p.createdAt.slice(0, 10);
const byTime = (a: Pick, b: Pick) => (when(a) + a.createdAt).localeCompare(when(b) + b.createdAt);

/** Streaks over wins and losses (pushes skip). Current is signed: +3 = three wins in a row. */
export function streaks(ps: Pick[]): { current: number; longestWin: number; longestLoss: number } {
  const seq = settled(ps).filter((p) => p.status !== "push").sort(byTime);
  let current = 0;
  let lw = 0;
  let ll = 0;
  let run = 0;
  for (const p of seq) {
    const win = p.status === "win";
    run = win ? (run > 0 ? run + 1 : 1) : run < 0 ? run - 1 : -1;
    lw = Math.max(lw, run);
    ll = Math.max(ll, -run);
  }
  current = run;
  return { current, longestWin: lw, longestLoss: ll };
}

export function myStats(ps: Pick[]) {
  const done = settled(ps).sort(byTime);
  const types = groupBy(ps, statType).filter((g) => g.t.w + g.t.l >= 2);
  const ranked = [...types].sort((a, b) => (b.t.pct ?? 0) - (a.t.pct ?? 0));
  const days = new Map<string, Tally>();
  for (const [d, list] of groupBy(done, when).map((g) => [g.key, g.t] as const)) days.set(d, list);
  return {
    all: tally(ps),
    bySport: groupBy(ps, (p) => p.sport),
    byKind: groupBy(ps, (p) => (pickKind(p) === "prop" ? "Props" : "Team picks")),
    bySide: groupBy(ps, (p) => (p.selection === "Over" ? "Overs" : p.selection === "Under" ? "Unders" : null)),
    byStat: groupBy(ps, statType),
    byBook: groupBy(ps, (p) => p.book || null),
    best: ranked.slice(0, 2),
    worst: ranked.length > 2 ? ranked.slice(-2).reverse() : [],
    streak: streaks(ps),
    last20: done.slice(-20).map((p) => p.status as "win" | "loss" | "push"),
    days,
  };
}
