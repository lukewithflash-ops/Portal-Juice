/**
 * PrizePicks-style soccer scoring (from PrizePicks' published tables).
 * Outfield: goal 10, assist 5, shot 1, shot on target 1, pass attempted 0.05, shot assisted 0.5,
 * clearance 1, tackle attempted 1, attempted dribble 1, cross 0.5, yellow -1, red -2, foul -0.5.
 * Goalie: start 5, save 2, goal conceded -2, clean sheet 5.
 */
export type SoccerLine = {
  goals: number; assists: number; shots: number; sot: number; passes: number; shotAssists: number; clearances: number;
  tackles: number; dribbles: number; crosses: number; yellow: number; red: number; fouls: number; saves: number; conceded: number; started: boolean;
};
const r2 = (n: number) => Math.round(n * 100) / 100;

export function soccerFantasy(s: SoccerLine): { outfield: number; goalie: number } {
  const outfield = 10 * s.goals + 5 * s.assists + s.shots + s.sot + 0.05 * s.passes + 0.5 * s.shotAssists + s.clearances + s.tackles + s.dribbles + 0.5 * s.crosses - s.yellow - 2 * s.red - 0.5 * s.fouls;
  const goalie = (s.started ? 5 : 0) + 2 * s.saves - 2 * s.conceded + (s.conceded === 0 && s.started ? 5 : 0);
  return { outfield: r2(outfield), goalie: r2(goalie) };
}

/** Soccer market words → our stat key. Null when not a soccer stat we read. */
export function soccerKey(market: string): string | null {
  const m = market.toLowerCase();
  if (/goalie|keeper|gk/.test(m) && /fantasy/.test(m)) return "s:gkfantasy";
  if (/fantasy/.test(m)) return "s:fantasy";
  if (/goals?\s*(allowed|conceded|against)/.test(m)) return "s:ga";
  if (/save/.test(m)) return "s:saves";
  if (/pass/.test(m)) return "s:passes";
  if (/shots?\s*(on\s*target|on\s*goal)|\bsot\b|\bsog\b/.test(m)) return "s:sot";
  if (/shots?\s*assist|key\s*pass|chances?\s*created/.test(m)) return "s:shotAssists";
  if (/shot/.test(m)) return "s:shots";
  if (/tackle/.test(m)) return "s:tackles";
  if (/clearance/.test(m)) return "s:clearances";
  if (/cross/.test(m)) return "s:crosses";
  if (/dribbl|take.?on/.test(m)) return "s:dribbles";
  if (/foul/.test(m)) return "s:fouls";
  if (/goal\s*\+\s*assist|goals?\s*and\s*assists?/.test(m)) return "s:ga+a";
  if (/assist/.test(m)) return "s:assists";
  if (/goal/.test(m)) return "s:goals";
  return null;
}

export function soccerStat(map: Record<string, string>, market: string): number | null {
  const k = soccerKey(market);
  if (!k) return null;
  const n = (x: string) => (map[x] != null ? Number(map[x]) : null);
  if (k === "s:ga+a") {
    const g = n("s:goals"), a = n("s:assists");
    return g == null && a == null ? null : (g ?? 0) + (a ?? 0);
  }
  if (k === "s:fantasy" && map["s:isgk"] === "1" && !/outfield/i.test(market)) return n("s:gkfantasy");
  return n(k);
}
