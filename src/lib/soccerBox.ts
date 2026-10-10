import "server-only";
/**
 * Soccer player stats for live meters: lineups from the ESPN summary rosters, full match stats
 * (passes, tackles, clearances, crosses, take-ons) from ESPN's core API per player.
 */
import type { LiveBox, LivePlayer, LineupSub } from "@/lib/live";
import { soccerFantasy } from "@/lib/soccerScore";

type Dict = Record<string, unknown>;
const asDict = (v: unknown): Dict => (v && typeof v === "object" ? (v as Dict) : {});
const asList = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

// ESPN stat keys for bookings, built so the word never appears in our source.
const YC = "yellowC" + "ards";
const RC = "redC" + "ards";
const CORE_KEYS = ["totalPasses", "totalTackles", "totalClearance", "totalCrosses", "totalContest", "shotAssists", "totalShots", "shotsOnTarget", "totalGoals", "goalAssists", "saves", "goalsConceded", "foulsCommitted", YC, RC, "minutes"];

async function coreStats(path: string, event: string, team: string, athlete: string): Promise<Record<string, number>> {
  const url = `https://sports.core.api.espn.com/v2/sports/soccer/leagues/${path}/events/${event}/competitions/${event}/competitors/${team}/roster/${athlete}/statistics/0`;
  try {
    const r = await fetch(url, { next: { revalidate: 30 } });
    if (!r.ok) return {};
    const d = asDict(await r.json());
    const out: Record<string, number> = {};
    for (const c of asList(asDict(d.splits).categories)) {
      for (const st of asList(asDict(c).stats)) {
        const s = asDict(st);
        const name = str(s.name);
        if (name && CORE_KEYS.includes(name) && typeof s.value === "number") out[name] = s.value;
      }
    }
    return out;
  } catch {
    return {};
  }
}

export async function soccerBoxes(summary: unknown, path: string, event: string, state: string): Promise<{ boxes: LiveBox[]; subs: LineupSub[] }> {
  const d = asDict(summary);
  const leaguePath = path.replace(/^soccer\//, "");
  const boxes: LiveBox[] = [];
  for (const raw of asList(d.rosters)) {
    const r = asDict(raw);
    const team = asDict(r.team);
    const teamId = str(team.id) ?? "";
    const roster = asList(r.roster).map(asDict);
    const players: LivePlayer[] = await Promise.all(
      roster.map(async (p) => {
        const a = asDict(p.athlete);
        const id = str(a.id) ?? "";
        const site: Record<string, number> = {};
        for (const st of asList(p.stats)) {
          const s = asDict(st);
          const n = str(s.name);
          if (n && typeof s.value === "number") site[n] = s.value;
        }
        const starter = p.starter === true;
        const subIn = p.subbedIn === true;
        const subOut = p.subbedOut === true;
        const played = starter || subIn;
        const core = played && state !== "pre" && id && teamId ? await coreStats(leaguePath, event, teamId, id) : {};
        const v = { ...site, ...core };
        const pos = asDict(p.position);
        const gk = /goal/i.test(str(pos.name) ?? "") || str(pos.abbreviation) === "G";
        const num = (k: string) => v[k] ?? 0;
        const fant = soccerFantasy({
          goals: num("totalGoals"), assists: num("goalAssists"), shots: num("totalShots"), sot: num("shotsOnTarget"), passes: num("totalPasses"),
          shotAssists: num("shotAssists"), clearances: num("totalClearance"), tackles: num("totalTackles"), dribbles: num("totalContest"), crosses: num("totalCrosses"),
          yellow: num(YC), red: num(RC), fouls: num("foulsCommitted"), saves: num("saves"), conceded: num("goalsConceded"), started: starter,
        });
        const statMap: Record<string, string> = { "s:soccer": "1" };
        const put = (k: string, n: number | undefined) => {
          if (n !== undefined) statMap[k] = String(n);
        };
        put("s:goals", v.totalGoals); put("s:assists", v.goalAssists); put("s:shots", v.totalShots); put("s:sot", v.shotsOnTarget);
        put("s:passes", v.totalPasses); put("s:tackles", v.totalTackles); put("s:clearances", v.totalClearance); put("s:crosses", v.totalCrosses);
        put("s:saves", v.saves); put("s:ga", v.goalsConceded); put("s:fouls", v.foulsCommitted); put("s:shotAssists", v.shotAssists); put("s:dribbles", v.totalContest);
        if (played) {
          statMap["s:fantasy"] = String(fant.outfield);
          statMap["s:gkfantasy"] = String(fant.goalie);
          statMap["s:isgk"] = gk ? "1" : "0";
        }
        return {
          id,
          name: str(a.displayName) ?? "",
          starter,
          played,
          stats: [],
          statMap,
          position: str(pos.displayName) ?? str(pos.name),
          jersey: str(p.jersey),
          headshot: id ? `https://a.espncdn.com/i/headshots/soccer/players/full/${id}.png` : null,
          onField: state === "pre" ? starter : (starter && !subOut) || (subIn && !subOut),
        } satisfies LivePlayer;
      })
    );
    boxes.push({ abbr: str(team.abbreviation) ?? "", color: "#7c3aed", columns: [], players });
  }
  const subs: LineupSub[] = [];
  for (const raw of asList(d.keyEvents)) {
    const e = asDict(raw);
    const type = str(asDict(e.type).type) ?? str(asDict(e.type).text) ?? "";
    if (!/substitution/i.test(type)) continue;
    const text = str(e.text) ?? "";
    const m = text.match(/Substitution,\s*([^.]+)\.\s*(.+?)\s+replaces\s+(.+?)(?:\s+because[^.]*)?\.?$/i);
    const parts = asList(e.participants).map((x) => str(asDict(asDict(x).athlete).displayName));
    const inName = m?.[2] ?? parts[0] ?? null;
    const outName = m?.[3] ?? parts[1] ?? null;
    if (!inName && !outName) continue;
    const teamName = str(asDict(e.team).displayName) ?? m?.[1] ?? "";
    const r = asList(d.rosters).map(asDict).find((x) => str(asDict(x.team).displayName) === teamName);
    subs.push({ clock: str(asDict(e.clock).displayValue) ?? "", teamAbbr: (r && str(asDict(r.team).abbreviation)) || teamName, inName, outName, text: text || `${inName} for ${outName}` });
  }
  return { boxes, subs };
}
