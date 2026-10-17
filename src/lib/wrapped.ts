/** Portal Wrapped: one week of your Log as story screens. W/L/P only; no money, no units. Pure. */
import { statType, streaks, tally, type Tally } from "@/lib/myStats";
import { pickPlayer, type Note } from "@/lib/notesCore";
import type { Pick } from "@/lib/types";

export type Wrapped = {
  from: string;
  to: string;
  record: Tally;
  best: { title: string; sub: string } | null;
  longest: number;
  noted: { name: string; n: number } | null;
  stat: { key: string; t: Tally } | null;
  league: { key: string; t: Tally } | null;
  parlays: { hit: number; total: number };
};

const day = (p: Pick) => p.date || p.createdAt.slice(0, 10);
const shift = (d: string, n: number) => {
  const x = new Date(d + "T12:00:00Z");
  x.setUTCDate(x.getUTCDate() + n);
  return x.toISOString().slice(0, 10);
};

function hottest(groups: Map<string, Pick[]>): { key: string; t: Tally } | null {
  let best: { key: string; t: Tally } | null = null;
  for (const [key, ps] of groups) {
    const t = tally(ps);
    if (t.w + t.l < 2 || t.pct == null) continue;
    if (!best || t.pct > (best.t.pct ?? 0) || (t.pct === best.t.pct && t.w > best.t.w)) best = { key, t };
  }
  return best;
}

/** The 7 days ending on `to` (YYYY-MM-DD, your local day). */
export function wrapWeek(picks: Pick[], notes: Note[], to: string): Wrapped {
  const from = shift(to, -6);
  const inWeek = (d: string) => d >= from && d <= to;
  const ps = picks.filter((p) => inWeek(day(p)));
  const record = tally(ps);
  // Best hit: the biggest parlay where every leg won; else the single win with the highest line.
  const slips = new Map<string, Pick[]>();
  for (const p of ps) if (p.slipId) slips.set(p.slipId, [...(slips.get(p.slipId) ?? []), p]);
  const cashed = [...slips.values()].filter((l) => l.length > 1 && l.every((p) => p.status === "win" || p.status === "push") && l.some((p) => p.status === "win")).sort((a, b) => b.length - a.length);
  let best: Wrapped["best"] = null;
  if (cashed[0]) best = { title: `${cashed[0].length}-leg parlay hit`, sub: cashed[0].map((p) => p.subject).slice(0, 4).join(" · ") + (cashed[0].length > 4 ? " …" : "") };
  else {
    const w = ps.filter((p) => p.status === "win").sort((a, b) => b.line - a.line)[0];
    if (w) best = { title: `${w.subject}`, sub: `${w.selection ?? ""} ${w.line} ${w.market ?? ""}`.replace(/\s+/g, " ").trim() };
  }
  const counts = new Map<string, number>();
  for (const n of notes) {
    if (!inWeek(n.createdAt.slice(0, 10))) continue;
    for (const pl of n.players ?? []) counts.set(pl.name, (counts.get(pl.name) ?? 0) + 1);
    for (const id of n.pickIds ?? []) {
      const p = picks.find((x) => x.id === id);
      const who = p ? pickPlayer(p) : null;
      if (who && !(n.players ?? []).some((x) => x.name === who.name)) counts.set(who.name, (counts.get(who.name) ?? 0) + 1);
    }
  }
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  const byStat = new Map<string, Pick[]>();
  const byLeague = new Map<string, Pick[]>();
  for (const p of ps) {
    const s = statType(p);
    if (s) byStat.set(s, [...(byStat.get(s) ?? []), p]);
    if (p.league) byLeague.set(p.league.toUpperCase(), [...(byLeague.get(p.league.toUpperCase()) ?? []), p]);
  }
  const done = [...slips.values()].filter((l) => l.length > 1 && l.every((p) => p.status !== "open"));
  return {
    from,
    to,
    record,
    best,
    longest: streaks(ps).longestWin,
    noted: top ? { name: top[0], n: top[1] } : null,
    stat: hottest(byStat),
    league: hottest(byLeague),
    parlays: { hit: done.filter((l) => l.every((p) => p.status !== "loss")).length, total: done.length },
  };
}
