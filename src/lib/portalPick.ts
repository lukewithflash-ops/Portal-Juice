/**
 * Portal Pick: one free daily selection from a fixed, public rule.
 *
 * RULE: among today's games that have not started, take the biggest open → current move
 * ESPN posted on a total or a home spread. Pick the side the market moved toward, at the
 * current number: total up → Over, total down → Under; home spread more negative → home,
 * less negative → away. Ties go to the earlier start. No move posted → no Portal Pick.
 * Graded against the ESPN final: beat the number = hit, miss it = miss, land on it = push.
 */
import type { Game } from "@/lib/slate";

export const PORTAL_PICK_LABEL = "Portal Pick · free · one a day. Not a guarantee.";
export const PORTAL_PICK_RULE =
  "The biggest open-to-now move ESPN posted on a total or spread for a game that has not started. We take the side the market moved toward, at the current number. Graded on the ESPN final.";

export type PortalPick = {
  date: string;
  league: string;
  gameId: string;
  label: string;
  awayAbbr: string;
  homeAbbr: string;
  kind: "total" | "spread";
  /** "Over" | "Under" for totals; team abbreviation for spreads. */
  side: string;
  /** Current number when picked. For spreads, the number for the picked side. */
  line: number;
  open: number;
  /** Home spread number as ESPN sent it (spreads only). */
  homeSpread: number | null;
  provider: string;
  start: string;
  homework: string;
  result: "hit" | "miss" | "push" | null;
  final: string | null;
};

function n1(n: number) {
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 10) / 10);
}

function signed(n: number) {
  return n > 0 ? `+${n1(n)}` : n1(n);
}

export function choosePortalPick(games: Game[], date: string): PortalPick | null {
  type Cand = { g: Game; kind: "total" | "spread"; move: number };
  const cands: Cand[] = [];
  for (const g of games) {
    const p = g.price;
    if (!p || g.state !== "pre") continue;
    if (p.total !== null && p.totalOpen !== null && p.total !== p.totalOpen) cands.push({ g, kind: "total", move: p.total - p.totalOpen });
    if (p.spreadHome !== null && p.spreadHomeOpen !== null && p.spreadHome !== p.spreadHomeOpen)
      cands.push({ g, kind: "spread", move: p.spreadHome - p.spreadHomeOpen });
  }
  if (!cands.length) return null;
  cands.sort((a, b) => Math.abs(b.move) - Math.abs(a.move) || a.g.start.localeCompare(b.g.start));
  const { g, kind, move } = cands[0];
  const p = g.price!;
  const label = `${g.away.abbr} @ ${g.home.abbr}`;
  const base = {
    date,
    league: g.league,
    gameId: g.id,
    label,
    awayAbbr: g.away.abbr,
    homeAbbr: g.home.abbr,
    kind,
    provider: p.provider,
    start: g.start,
    result: null,
    final: null,
  } as const;
  if (kind === "total") {
    const side = move > 0 ? "Over" : "Under";
    return {
      ...base,
      side,
      line: p.total!,
      open: p.totalOpen!,
      homeSpread: null,
      homework: `Total moved ${n1(p.totalOpen!)} → ${n1(p.total!)} since open (${move > 0 ? "up" : "down"} ${n1(Math.abs(move))}, ${p.provider}). The biggest posted move on today's board, so the pick follows it: ${side} ${n1(p.total!)}.`,
    };
  }
  const home = move < 0;
  const side = home ? g.home.abbr : g.away.abbr;
  const line = home ? p.spreadHome! : -p.spreadHome!;
  const open = home ? p.spreadHomeOpen! : -p.spreadHomeOpen!;
  return {
    ...base,
    side,
    line,
    open,
    homeSpread: p.spreadHome!,
    homework: `${g.home.abbr} spread moved ${signed(p.spreadHomeOpen!)} → ${signed(p.spreadHome!)} since open (${n1(Math.abs(move))} points, ${p.provider}). The biggest posted move on today's board, toward ${side}: ${side} ${signed(line)}.`,
  };
}

/** Grade from final scores. Null if either score is missing. */
export function gradePortalPick(pick: PortalPick, away: number | null, home: number | null): PortalPick["result"] {
  if (away === null || home === null || !Number.isFinite(away) || !Number.isFinite(home)) return null;
  if (pick.kind === "total") {
    const total = away + home;
    if (total === pick.line) return "push";
    return (pick.side === "Over") === total > pick.line ? "hit" : "miss";
  }
  const margin = pick.side === pick.homeAbbr ? home - away : away - home;
  const covered = margin + pick.line;
  if (covered === 0) return "push";
  return covered > 0 ? "hit" : "miss";
}

export type PortalRecord = { hits: number; misses: number; pushes: number; graded: number; rate: number | null };

export function portalRecord(picks: PortalPick[]): PortalRecord {
  const hits = picks.filter((p) => p.result === "hit").length;
  const misses = picks.filter((p) => p.result === "miss").length;
  const pushes = picks.filter((p) => p.result === "push").length;
  const graded = hits + misses;
  return { hits, misses, pushes, graded, rate: graded ? Math.round((hits / graded) * 1000) / 10 : null };
}
