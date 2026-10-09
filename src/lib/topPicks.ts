import "server-only";
import { unstable_cache } from "next/cache";
import { analyzeLeg, statFromMarket, type LegInput, type LegReport } from "@/lib/breakdown";
import { getGameDetail } from "@/lib/espn";
import { researchGame, researchPlayer } from "@/lib/research";
import { rankTopPicks, type TopPicks } from "@/lib/topRank";

const MAX_PROPS = 8;

const num = (s: string | null | undefined) => {
  const m = /-?\d+(?:\.\d+)?/.exec(s ?? "");
  return m ? Number(m[0]) : null;
};

async function build(league: string, id: string): Promise<TopPicks> {
  const g = await researchGame(league, id);
  if (!g) return { picks: [], considered: 0, note: "ESPN has no data for this game.", at: new Date().toISOString() };
  const out: { leg: LegInput; report: LegReport }[] = [];
  const add = (leg: LegInput, report: LegReport) => out.push({ leg, report });
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
  const bundle = await getGameDetail(league, id);
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
    .slice(0, MAX_PROPS);
  await Promise.all(
    props.map(async ({ p, stat, line }) => {
      const pr = await researchPlayer(league, p.athleteId, stat as string, g.start).catch(() => null);
      if (!pr) return;
      for (const pick of ["over", "under"] as const) {
        const leg: LegInput = { league, gameId: id, kind: "prop", athleteId: p.athleteId, athleteName: p.name, stat: stat as string, line, pick, openLine: num(p.openLine) };
        add(leg, analyzeLeg(leg, g, pr));
      }
    })
  );
  return rankTopPicks(out);
}

/** Three best-leaning legs for one game. Cached briefly so tiles stay fast. */
export function getTopPicks(league: string, id: string, live: boolean): Promise<TopPicks> {
  return unstable_cache(() => build(league, id), ["pj-top3", league, id, live ? "in" : "pre"], { revalidate: live ? 120 : 600 })();
}
