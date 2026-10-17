import "server-only";
import { unstable_cache } from "next/cache";
import { analyzeLeg, hitCount, statFromMarket, type GameResearch, type LegInput, type LegReport, type PlayerResearch } from "@/lib/breakdown";
import { getGameDetail } from "@/lib/espn";
import { researchGame, researchPlayer } from "@/lib/research";
import { rankTopPicks, type TopPicks } from "@/lib/topRank";

const MAX_PROPS = 8;

const num = (s: string | null | undefined) => {
  const m = /-?\d+(?:\.\d+)?/.exec(s ?? "");
  return m ? Number(m[0]) : null;
};

/** Recent record of this exact line from real logs: player game log for props, team form for sides and totals. */
export type Recent = { hits: number; games: number; what: string };
export type LegRow = { leg: LegInput; report: LegReport; recent: Recent | null };

function teamRecent(leg: LegInput, g: GameResearch): Recent | null {
  if (leg.kind === "total" && leg.line != null) {
    const tot = [...g.home.form, ...g.away.form].map((f) => f.pf + f.pa).filter(Number.isFinite);
    if (tot.length < 5) return null;
    const hits = tot.filter((t) => (leg.pick === "under" ? t < leg.line! : t > leg.line!)).length;
    return { hits, games: tot.length, what: `${leg.pick === "under" ? "Under" : "Over"} ${leg.line} in ${hits} of the two teams' last ${tot.length} games` };
  }
  const me = leg.side === "away" ? g.away : g.home;
  if (!me.form.length || me.form.length < 5) return null;
  if (leg.kind === "spread" && leg.line != null) {
    const hits = me.form.filter((f) => f.pf - f.pa + leg.line! > 0).length;
    return { hits, games: me.form.length, what: `${me.abbr} would have covered ${leg.line > 0 ? "+" : ""}${leg.line} in ${hits} of its last ${me.form.length}` };
  }
  if (leg.kind === "moneyline") {
    const hits = me.form.filter((f) => f.result === "W").length;
    return { hits, games: me.form.length, what: `${me.abbr} won ${hits} of its last ${me.form.length}` };
  }
  return null;
}

/** Every leg we can check for one game, with its report and how that line did recently. */
export async function gameLegRows(league: string, id: string, maxProps = MAX_PROPS): Promise<{ g: GameResearch | null; rows: LegRow[] }> {
  const g = await researchGame(league, id);
  if (!g) return { g: null, rows: [] };
  const out: LegRow[] = [];
  const add = (leg: LegInput, report: LegReport, pr: PlayerResearch | null = null) => {
    let recent: Recent | null = null;
    if (leg.kind === "prop" && pr && leg.line != null) {
      const v = pr.games.slice(0, 10).map((x) => x.value);
      if (v.length) {
        const c = hitCount(v, leg.line, leg.pick ?? "over");
        recent = { hits: c.hit, games: c.n, what: `${leg.pick === "under" ? "Under" : "Over"} ${leg.line} in ${c.hit} of ${pr.name}'s last ${c.n} (ESPN game log)` };
      }
    } else recent = teamRecent(leg, g);
    out.push({ leg, report, recent });
  };
  const o = g.odds;
  if (o) {
    for (const side of ["home", "away"] as const) {
      if (o.spreadHome != null) {
        const leg: LegInput = { league, gameId: id, kind: "spread", side, line: side === "home" ? o.spreadHome : -o.spreadHome };
        add(leg, analyzeLeg(leg, g));
      }
      if ((side === "home" ? o.homeMl : o.awayMl) != null) {
        const leg: LegInput = { league, gameId: id, kind: "moneyline", side };
        add(leg, analyzeLeg(leg, g));
      }
    }
    if (o.total != null) {
      for (const pick of ["over", "under"] as const) {
        const leg: LegInput = { league, gameId: id, kind: "total", pick, line: o.total };
        add(leg, analyzeLeg(leg, g));
      }
    }
  }
  const bundle = await getGameDetail(league, id).catch(() => null);
  const seen = new Set<string>();
  const props = (bundle?.props ?? [])
    .map((p) => ({ p, stat: statFromMarket(league, p.market), line: num(p.line) }))
    .filter((x) => {
      if (!x.stat || x.line == null) return false;
      const k = `${x.p.athleteId}:${x.stat}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .slice(0, maxProps);
  await Promise.all(
    props.map(async ({ p, stat, line }) => {
      const pr = await researchPlayer(league, p.athleteId, stat as string, g.start).catch(() => null);
      if (!pr) return;
      for (const pick of ["over", "under"] as const) {
        const leg: LegInput = { league, gameId: id, kind: "prop", athleteId: p.athleteId, athleteName: p.name, stat: stat as string, line, pick, openLine: num(p.openLine) };
        add(leg, analyzeLeg(leg, g, pr), pr);
      }
    })
  );
  return { g, rows: out };
}

async function build(league: string, id: string): Promise<TopPicks> {
  const { g, rows } = await gameLegRows(league, id);
  if (!g) return { picks: [], considered: 0, note: "ESPN has no data for this game.", at: new Date().toISOString() };
  return rankTopPicks(rows);
}

/** Three best-leaning legs for one game. Cached briefly so tiles stay fast. */
export function getTopPicks(league: string, id: string, live: boolean): Promise<TopPicks> {
  return unstable_cache(() => build(league, id), ["pj-top3", league, id, live ? "in" : "pre"], { revalidate: live ? 120 : 600 })();
}
