/** What changed in a head-to-head match between refreshes. Pure. */
export function tennisFx(prev: string, next: string): string | null {
  // sig: "awaySets|homeSets|state" where sets are "6-4,3" style lists.
  const [pa, ph] = prev.split("|");
  const [na, nh, st] = next.split("|");
  if (st === "post") return "MATCH";
  const count = (s: string | undefined) => (s ? s.split(",").filter(Boolean).length : 0);
  if (count(na) + count(nh) > count(pa) + count(ph)) return "NEW SET";
  return na !== pa || nh !== ph ? "GAME" : null;
}

export function fightFx(prev: string, next: string): string | null {
  // sig: "detail|state"
  const [pd] = prev.split("|");
  const [nd, st] = next.split("|");
  if (st === "post") return "FINISH";
  const r = nd.match(/round (\d+)|r(\d)/i);
  const pr = pd.match(/round (\d+)|r(\d)/i);
  if (r && (!pr || (r[1] ?? r[2]) !== (pr[1] ?? pr[2]))) return `ROUND ${r[1] ?? r[2]}`;
  return null;
}

/** Golf: a birdie (-1) or eagle (-2 or better) on a hole, from the to-par score. */
export function golfFx(prev: string, next: string): string | null {
  const n = (s: string) => (s === "E" ? 0 : Number(s));
  const d = n(next) - n(prev);
  if (!Number.isFinite(d)) return null;
  if (d <= -2) return "EAGLE";
  if (d === -1) return "BIRDIE";
  return null;
}
