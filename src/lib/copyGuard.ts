import type { Pick } from "./types";

type LegLike = { subject: string; line: number; market?: string | null; selection?: string | null; gameId?: string | null };

const norm = (s: unknown) => String(s ?? "").trim().toLowerCase();
/** One leg: player + stat + line + side + game. */
export const legKey = (l: LegLike) => [norm(l.subject), norm(l.market), Number(l.line), norm(l.selection), norm(l.gameId)].join("|");
/** Order-independent key for a set of legs. */
export const setKey = (ls: LegLike[]) => ls.map(legKey).sort().join("~");

/** Groups a log into slips: legs sharing slipId, else each pick alone. */
export function slipsOf(ps: Pick[]): Pick[][] {
  const by = new Map<string, Pick[]>();
  for (const p of ps) {
    const k = p.slipId ? `s:${p.slipId}` : `p:${p.id}`;
    by.set(k, [...(by.get(k) ?? []), p]);
  }
  return [...by.values()];
}

/** True when the log already holds a slip with exactly these legs (copied from this source, when given). */
export function alreadyInLog(mine: Pick[], legs: LegLike[], from?: string): boolean {
  if (!legs.length) return false;
  const want = setKey(legs);
  return slipsOf(mine).some((s) => (!from || s.every((p) => p.tailFrom === from)) && setKey(s) === want);
}

/**
 * Exact duplicate copies: same source, same leg set, all open, created within `windowMs` of an earlier copy.
 * Returns the pick ids of the extra copies (the earliest copy is kept).
 */
export function copyDupes(ps: Pick[], windowMs = 2 * 60 * 1000): string[] {
  const groups = slipsOf(ps.filter((p) => p.tailFrom))
    .filter((s) => s.every((p) => p.status === "open") && new Set(s.map((p) => p.tailFrom)).size === 1)
    .map((s) => ({ s, key: `${s[0].tailFrom}#${setKey(s)}`, t: Math.min(...s.map((p) => Date.parse(p.createdAt))) }))
    .filter((g) => Number.isFinite(g.t))
    .sort((a, b) => a.t - b.t);
  const kept: { key: string; t: number }[] = [];
  const drop: string[] = [];
  for (const g of groups) {
    if (kept.some((k) => k.key === g.key && g.t - k.t <= windowMs)) drop.push(...g.s.map((p) => p.id));
    else kept.push(g);
  }
  return drop;
}
