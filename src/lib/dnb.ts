/** Do Not Bet list: teams, players or name+stat combos you keep missing on. Records come only from graded Log picks. Pure. */
import type { Pick } from "./types";
import { tally, streaks, type Tally } from "./myStats";

export type DnbEntry = { id: string; name: string; market?: string; side?: "Over" | "Under"; note?: string; at: number };
export type DnbRecord = { t: Tally; streak: number; missed: { market: string; n: number }[]; picks: number };
export type LegLike = { subject: string; market?: string | null; selection?: "Over" | "Under" | null };

export const DNB_KEY = "pj-dnb-v1";
const norm = (s: unknown) => String(s ?? "").toLowerCase().replace(/[^a-z0-9+ ]/g, " ").replace(/\s+/g, " ").trim();
/** "points" and "pts" and "Player Points" all compare as the same stat. */
const STAT: Record<string, string> = { points: "pts", point: "pts", rebounds: "reb", rebs: "reb", assists: "ast", threes: "3pm", "3 pointers made": "3pm", "3pt made": "3pm", yards: "yds" };
const stat = (s: unknown) => {
  const n = norm(s).replace(/^player /, "");
  return STAT[n] ?? n;
};

function nameHit(entry: string, subject: string) {
  const e = norm(entry);
  const s = norm(subject);
  if (!e || !s) return false;
  return s === e || ` ${s} `.includes(` ${e} `);
}

export function matches(e: DnbEntry, l: LegLike): boolean {
  if (!nameHit(e.name, l.subject)) return false;
  if (e.market) {
    const a = stat(e.market);
    const b = stat(l.market);
    if (!b || !(a === b || ` ${b} `.includes(` ${a} `))) return false;
  }
  if (e.side && l.selection !== e.side) return false;
  return true;
}

export function recordFor(e: DnbEntry, ps: Pick[]): DnbRecord {
  const mine = ps.filter((p) => matches(e, p));
  const miss = new Map<string, number>();
  for (const p of mine) if (p.status === "loss" && p.market) miss.set(stat(p.market), (miss.get(stat(p.market)) ?? 0) + 1);
  return { t: tally(mine), streak: streaks(mine).current, missed: [...miss.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([market, n]) => ({ market, n })), picks: mine.length };
}

export const label = (e: Pick | DnbEntry | { name: string; market?: string; side?: string }) => {
  const x = e as DnbEntry;
  return [x.name, x.side === "Over" ? "overs" : x.side === "Under" ? "unders" : "", x.market ?? ""].filter(Boolean).join(" ");
};

/** Candidates: a name, or name+stat, with 3+ graded W/L and a hit rate of 30% or less. Worst first. */
export function suggest(ps: Pick[], list: DnbEntry[], min = 3, maxPct = 30): (DnbEntry & { rec: DnbRecord })[] {
  const groups = new Map<string, DnbEntry>();
  for (const p of ps) {
    if (p.status !== "win" && p.status !== "loss") continue;
    const name = p.subject.trim();
    if (!name) continue;
    groups.set(norm(name), { id: `s:${norm(name)}`, name, at: 0 });
    if (p.market) groups.set(`${norm(name)}|${stat(p.market)}`, { id: `s:${norm(name)}|${stat(p.market)}`, name, market: stat(p.market), at: 0 });
  }
  const have = new Set(list.map((e) => `${norm(e.name)}|${e.market ? stat(e.market) : ""}|${e.side ?? ""}`));
  return [...groups.values()]
    .filter((e) => !have.has(`${norm(e.name)}|${e.market ?? ""}|`))
    .map((e) => ({ ...e, rec: recordFor(e, ps) }))
    .filter((e) => e.rec.t.w + e.rec.t.l >= min && (e.rec.t.pct ?? 0) <= maxPct)
    .filter((e, _, all) => !e.market || !all.some((o) => !o.market && norm(o.name) === norm(e.name) && o.rec.picks === e.rec.picks))
    .sort((a, b) => (a.rec.t.pct ?? 0) - (b.rec.t.pct ?? 0) || b.rec.t.l - a.rec.t.l)
    .slice(0, 6);
}

/** Entries a set of legs runs into, with your record on each. */
export function hits(list: DnbEntry[], legs: LegLike[], ps: Pick[]) {
  return list.filter((e) => legs.some((l) => matches(e, l))).map((e) => ({ e, rec: recordFor(e, ps) }));
}

export function parseList(raw: string | null): DnbEntry[] {
  try {
    const v = JSON.parse(raw ?? "[]");
    return Array.isArray(v) ? v.filter((e) => e && typeof e.id === "string" && typeof e.name === "string").slice(0, 100) : [];
  } catch {
    return [];
  }
}
export const recText = (t: Tally) => `${t.w}-${t.l}${t.p ? `-${t.p}` : ""}${t.pct == null ? "" : ` · ${Math.round(t.pct)}%`}`;
