/** Parlay record from the Log: legs sharing a slipId (2+ legs) graded as one ticket. No money. Pure. */
import type { Pick } from "@/lib/types";

export type ParlayResult = "win" | "loss" | "push" | "open";
export type Parlay = { id: string; legs: Pick[]; result: ParlayResult; when: string };
export type ParlayTally = { w: number; l: number; p: number; open: number; pct: number | null };

/** Any loss = L. Otherwise any open = open. All push = P. Else (wins, pushes drop off) = W. */
export function gradeParlay(legs: Pick[]): ParlayResult {
  if (legs.some((x) => x.status === "loss")) return "loss";
  if (legs.some((x) => x.status === "open")) return "open";
  if (legs.every((x) => x.status === "push")) return "push";
  return "win";
}

export function parlays(ps: Pick[]): Parlay[] {
  const m = new Map<string, Pick[]>();
  for (const p of ps) if (p.slipId) m.set(p.slipId, [...(m.get(p.slipId) ?? []), p]);
  const out: Parlay[] = [];
  for (const [id, legs] of m) {
    if (legs.length < 2) continue;
    const when = legs.map((x) => (x.date || x.createdAt.slice(0, 10)) + x.createdAt).sort().pop() ?? "";
    out.push({ id, legs, result: gradeParlay(legs), when });
  }
  return out.sort((a, b) => a.when.localeCompare(b.when));
}

export function parlayTally(list: Parlay[]): ParlayTally {
  const c = (r: ParlayResult) => list.filter((x) => x.result === r).length;
  const w = c("win"), l = c("loss");
  return { w, l, p: c("push"), open: c("open"), pct: w + l ? Math.round((w / (w + l)) * 1000) / 10 : null };
}

export function parlayStats(ps: Pick[]) {
  const list = parlays(ps);
  const seq = list.filter((x) => x.result === "win" || x.result === "loss");
  let current = 0, lw = 0, ll = 0, rw = 0, rl = 0;
  for (const x of seq) {
    if (x.result === "win") { rw++; rl = 0; } else { rl++; rw = 0; }
    lw = Math.max(lw, rw); ll = Math.max(ll, rl);
  }
  for (let i = seq.length - 1; i >= 0; i--) {
    const s = seq[i].result === "win" ? 1 : -1;
    if (current === 0 || Math.sign(current) === s) current += s; else break;
  }
  const bucket = (n: number) => (n >= 6 ? "6+" : String(n));
  const bm = new Map<string, Parlay[]>();
  for (const x of list) { const k = bucket(x.legs.length); bm.set(k, [...(bm.get(k) ?? []), x]); }
  const byLegs = [...bm.entries()].sort((a, b) => parseInt(a[0]) - parseInt(b[0])).map(([key, l]) => ({ key, t: parlayTally(l) }));
  // Legs that sank otherwise-good tickets: parlays lost by exactly one leg.
  const oneOff = list.filter((x) => x.result === "loss" && x.legs.filter((y) => y.status === "loss").length === 1).length;
  return { all: parlayTally(list), streak: { current, longestWin: lw, longestLoss: ll }, byLegs, oneOff, last10: list.filter((x) => x.result !== "open").slice(-10).map((x) => x.result) };
}
