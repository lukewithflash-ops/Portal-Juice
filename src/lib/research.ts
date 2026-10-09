import "server-only";
import { unstable_cache } from "next/cache";
import { getJson, getGameDetail } from "@/lib/espn";
import type { FormGame, GameResearch, PitcherResearch, PlayerResearch, TeamResearch } from "@/lib/breakdown";
import { americanNumber, parseOddsMove, parseSummaryDetail } from "@/lib/detail";
import { leagueById, type League } from "@/lib/slate";
import { allowedHeadshot } from "@/lib/headshots";
import { parseGameLog, parseStandings, rankAll, type StandRow } from "@/lib/researchParse";

type Dict = Record<string, unknown>;
const asDict = (v: unknown): Dict => (v && typeof v === "object" ? (v as Dict) : {});
const asList = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
const num = (v: unknown): number | null => {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() && Number.isFinite(Number(v.replace(/,/g, "")))) return Number(v.replace(/,/g, ""));
  return null;
};
const r1 = (n: number) => Math.round(n * 10) / 10;

const site = (l: League) => `https://site.api.espn.com/apis/site/v2/sports/${l.sport}/${l.slug}`;
const web = (l: League) => `https://site.web.api.espn.com/apis/common/v3/sports/${l.sport}/${l.slug}`;

const standings = (league: League) =>
  unstable_cache(
    async () => {
      try {
        return parseStandings(await getJson(`https://site.api.espn.com/apis/v2/sports/${league.sport}/${league.slug}/standings`));
      } catch {
        return [] as StandRow[];
      }
    },
    ["pj-standings", league.id],
    { revalidate: 6 * 3600 }
  )();

type DefRow = { id: string; pass: number; rush: number };

/** NFL pass and rush yards allowed per game, every team. One call per team, cached for hours. */
const nflDefense = unstable_cache(
  async (): Promise<DefRow[]> => {
    const league = leagueById("nfl") as League;
    let ids: string[] = [];
    try {
      const t = asDict(await getJson(`${site(league)}/teams`));
      ids = asList(asDict(asList(asDict(asList(t.sports)[0]).leagues)[0]).teams)
        .map((x) => str(asDict(asDict(x).team).id))
        .filter((x): x is string => !!x);
    } catch {
      return [];
    }
    const rows: DefRow[] = [];
    await Promise.all(
      ids.map(async (id) => {
        try {
          const d = asDict(await getJson(`${site(league)}/teams/${id}/statistics`));
          const opp = asList(asDict(d.results).opponent).map(asDict);
          const get = (cat: string, name: string) =>
            num(asList(opp.find((c) => c.name === cat)?.stats).map(asDict).find((s) => s.name === name)?.value);
          const pass = get("passing", "netPassingYardsPerGame");
          const rush = get("rushing", "rushingYardsPerGame");
          if (pass !== null && rush !== null) rows.push({ id, pass, rush });
        } catch {
          /* skip a team */
        }
      })
    );
    return rows;
  },
  ["pj-nfl-defense"],
  { revalidate: 12 * 3600 }
);

function formFrom(block: Dict, teamId: string): FormGame[] {
  const out: FormGame[] = [];
  const events = asList(block.events).map(asDict);
  events.sort((a, b) => ((str(b.gameDate) ?? "") > (str(a.gameDate) ?? "") ? 1 : -1));
  for (const ev of events) {
    const hs = num(ev.homeTeamScore);
    const as = num(ev.awayTeamScore);
    const res = str(ev.gameResult);
    if (hs === null || as === null || !res) continue;
    const home = str(ev.homeTeamId) === teamId;
    out.push({ id: str(ev.id) ?? undefined, result: res === "W" ? "W" : res === "L" ? "L" : "T", pf: home ? hs : as, pa: home ? as : hs, opp: str(asDict(ev.opponent).abbreviation) ?? "" });
  }
  return out.slice(0, 5);
}

async function teamBatting(league: League, id: string): Promise<TeamResearch["batting"]> {
  try {
    const d = asDict(await getJson(`${site(league)}/teams/${id}/statistics`));
    const cats = asList(asDict(asDict(d.results).stats).categories).map(asDict);
    const bat = asList(cats.find((c) => c.name === "batting")?.stats).map(asDict);
    const get = (n: string) => bat.find((s) => s.name === n);
    const games = num(get("teamGamesPlayed")?.value) ?? num(get("gamesPlayed")?.value);
    const runs = num(get("runs")?.value);
    return {
      avg: str(get("avg")?.displayValue),
      ops: str(get("OPS")?.displayValue) ?? str(get("onBasePlusSlugging")?.displayValue),
      runsPerGame: games && runs !== null ? r1(runs / games) : null,
      games,
    };
  } catch {
    return null;
  }
}

async function pitcher(league: League, raw: Dict): Promise<PitcherResearch | null> {
  const a = asDict(raw.athlete);
  const id = str(a.id) ?? (raw.playerId != null ? String(raw.playerId) : null);
  const name = str(a.displayName) ?? str(a.fullName);
  if (!id || !name) return null;
  const out: PitcherResearch = { id, name, hand: null, era: null, eraRank: null, whip: null, k: null, record: null, recent: [] };
  const [ath, log] = await Promise.allSettled([getJson(`${web(league)}/athletes/${id}`), getJson(`${web(league)}/athletes/${id}/gamelog`)]);
  if (ath.status === "fulfilled") {
    const at = asDict(asDict(ath.value).athlete);
    const bt = str(at.displayBatsThrows);
    out.hand = bt ? (bt.split("/")[1] ?? null) : null;
    for (const s of asList(asDict(at.statsSummary).statistics).map(asDict)) {
      const ab = str(s.abbreviation);
      if (ab === "ERA") {
        out.era = num(s.value);
        out.eraRank = str(s.rankDisplayValue);
      } else if (ab === "WHIP") out.whip = num(s.value);
      else if (ab === "K") out.k = num(s.value);
      else if (ab === "W-L") out.record = str(s.displayValue);
    }
  }
  if (log.status === "fulfilled") {
    const d = asDict(log.value);
    const names = asList(d.names).map((x) => str(x) ?? "");
    const ix = (n: string) => names.indexOf(n);
    const meta = asDict(d.events);
    const rows: PitcherResearch["recent"] = [];
    const seen = new Set<string>();
    for (const st of asList(d.seasonTypes).map(asDict)) {
      if (/preseason|spring/i.test(str(st.displayName) ?? "")) continue;
      for (const cat of asList(st.categories)) {
        for (const evRaw of asList(asDict(cat).events)) {
          const ev = asDict(evRaw);
          const eid = str(ev.eventId);
          if (!eid || seen.has(eid)) continue;
          const stats = asList(ev.stats);
          const ip = num(stats[ix("innings")]);
          if (ip === null) continue;
          seen.add(eid);
          const m = asDict(meta[eid]);
          rows.push({ date: str(m.gameDate) ?? "", ip, er: num(stats[ix("earnedRuns")]) ?? 0, k: num(stats[ix("strikeouts")]) ?? 0, opp: str(asDict(m.opponent).abbreviation) ?? "" });
        }
      }
    }
    rows.sort((x, y) => (x.date < y.date ? 1 : -1));
    // Starts only: 3+ innings.
    out.recent = rows.filter((r) => r.ip >= 3).slice(0, 5);
  }
  return out;
}

function priceNum(raw: string | null | undefined): number | null {
  return americanNumber(raw ?? null);
}

/** Everything the rules need for one game. Real ESPN numbers only. */
export async function researchGame(leagueId: string, id: string): Promise<GameResearch | null> {
  const league = leagueById(leagueId);
  if (!league || !/^\d+$/.test(id)) return null;
  let summary: Dict;
  try {
    summary = asDict(await getJson(`${site(league)}/summary?event=${id}`));
  } catch {
    return null;
  }
  const comp = asDict(asList(asDict(summary.header).competitions)[0]);
  const sides = asList(comp.competitors).map(asDict);
  const h = sides.find((s) => s.homeAway === "home");
  const a = sides.find((s) => s.homeAway === "away");
  if (!h || !a) return null;
  const detail = parseSummaryDetail(summary, league.label);
  const move = parseOddsMove(asList(summary.pickcenter)[0] ?? asList(summary.odds)[0]);
  const [stand, defense] = await Promise.all([standings(league), league.id === "nfl" ? nflDefense() : Promise.resolve([] as DefRow[])]);
  const ppgRank = rankAll(stand.map((s) => ({ id: s.id, value: s.ppg })), true);
  const papgRank = rankAll(stand.map((s) => ({ id: s.id, value: s.papg })), false);
  const passRank = rankAll(defense.map((s) => ({ id: s.id, value: s.pass })), false);
  const rushRank = rankAll(defense.map((s) => ({ id: s.id, value: s.rush })), false);

  const five = asList(summary.lastFiveGames).map(asDict);
  const ats = detail.ats;
  const team = async (c: Dict): Promise<TeamResearch> => {
    const t = asDict(c.team);
    const tid = str(t.id) ?? "";
    const abbr = str(t.abbreviation) ?? "";
    const block = five.find((b) => str(asDict(b.team).id) === tid) ?? {};
    const rec = asList(c.record).map(asDict).find((r) => r.type === "total" || r.name === "overall") ?? asDict(asList(c.record)[0]);
    return {
      id: tid,
      abbr,
      logo: (() => {
        const u = str(t.logo) ?? str(asDict(asList(t.logos)[0]).href);
        return u && u.startsWith("https://a.espncdn.com/") ? u : null;
      })(),
      name: str(t.displayName) ?? abbr,
      record: str(rec.summary) ?? stand.find((s) => s.id === tid)?.record ?? null,
      form: formFrom(block, tid),
      ats: ats.find((x) => x.team === abbr)?.summary ?? null,
      ppg: ppgRank.get(tid) ?? null,
      papg: papgRank.get(tid) ?? null,
      passAllowed: passRank.get(tid) ?? null,
      rushAllowed: rushRank.get(tid) ?? null,
      batting: league.id === "mlb" ? await teamBatting(league, tid) : null,
      injuries: detail.injuries.filter((i) => i.team === abbr).map((i) => ({ name: i.name, status: i.status })),
    };
  };
  const [home, away] = await Promise.all([team(h), team(a)]);

  let pitchers: GameResearch["pitchers"] = null;
  if (league.id === "mlb") {
    const prob = (c: Dict) => asList(c.probables).map(asDict).find((p) => /probable/i.test(str(p.name) ?? "") || str(p.abbreviation) === "SP");
    // The scoreboard sometimes has probables the summary lacks.
    let hp = prob(h);
    let ap = prob(a);
    if (!hp || !ap) {
      try {
        const day = (str(comp.date) ?? "").slice(0, 10).replace(/-/g, "");
        const sb = asDict(await getJson(`${site(league)}/scoreboard?dates=${day}`));
        const ev = asList(sb.events).map(asDict).find((e) => str(e.id) === id);
        const cs = asList(asDict(asList(ev?.competitions)[0]).competitors).map(asDict);
        hp = hp ?? prob(cs.find((x) => x.homeAway === "home") ?? {});
        ap = ap ?? prob(cs.find((x) => x.homeAway === "away") ?? {});
      } catch {
        /* no probables */
      }
    }
    const [ph, pa] = await Promise.all([hp ? pitcher(league, hp) : null, ap ? pitcher(league, ap) : null]);
    pitchers = { home: ph, away: pa };
  }

  const venue = asDict(asDict(summary.gameInfo).venue);
  const status = asDict(asDict(comp.status).type);
  const state = str(status.state);
  return {
    league: league.id,
    id,
    label: `${away.abbr} @ ${home.abbr}`,
    start: str(comp.date) ?? "",
    state: state === "in" || state === "post" ? state : "pre",
    venue: detail.venue,
    weather: detail.weather,
    indoor: typeof venue.indoor === "boolean" ? venue.indoor : null,
    odds: move
      ? {
          provider: move.provider,
          spreadHome: move.spreadHome,
          spreadHomeOpen: move.spreadHomeOpen,
          total: move.total,
          totalOpen: move.totalOpen,
          homeMl: priceNum(move.homeMl),
          awayMl: priceNum(move.awayMl),
          homeMlOpen: priceNum(move.homeMlOpen),
          awayMlOpen: priceNum(move.awayMlOpen),
          overJuice: priceNum(move.overJuice),
          underJuice: priceNum(move.underJuice),
          homeSpreadJuice: priceNum(move.homeSpreadJuice),
          awaySpreadJuice: priceNum(move.awaySpreadJuice),
        }
      : null,
    home,
    away,
    pitchers,
  };
}

export async function researchPlayer(leagueId: string, athleteId: string, stat: string, gameStart?: string): Promise<PlayerResearch | null> {
  const league = leagueById(leagueId);
  if (!league || !/^\d+$/.test(athleteId)) return null;
  const [ath, log] = await Promise.allSettled([getJson(`${web(league)}/athletes/${athleteId}`), getJson(`${web(league)}/athletes/${athleteId}/gamelog`)]);
  if (log.status !== "fulfilled") return null;
  const at = ath.status === "fulfilled" ? asDict(asDict(ath.value).athlete) : {};
  let games = parseGameLog(log.value, stat);
  // Never count the game being checked.
  if (gameStart) games = games.filter((g) => !g.date || g.date.slice(0, 10) < gameStart.slice(0, 10));
  return {
    id: athleteId,
    name: str(at.displayName) ?? "",
    headshot: allowedHeadshot(str(asDict(at.headshot).href)),
    team: str(asDict(at.team).abbreviation) ?? "",
    teamId: str(asDict(at.team).id),
    position: str(asDict(at.position).abbreviation),
    statLabel: stat,
    games,
  };
}

export type RosterPlayer = { id: string; name: string; team: string; pos: string | null };

export async function gameRoster(leagueId: string, id: string): Promise<{ players: RosterPlayer[]; props: { athleteId: string; name: string; team: string; market: string; line: string; openLine: string | null }[] }> {
  const league = leagueById(leagueId);
  if (!league) return { players: [], props: [] };
  const bundle = await getGameDetail(leagueId, id);
  if (!bundle) return { players: [], props: [] };
  const players: RosterPlayer[] = [];
  await Promise.all(
    [bundle.game.away, bundle.game.home].map(async (side) => {
      try {
        const d = asDict(await getJson(`${site(league)}/teams/${side.id}/roster`));
        const flat: Dict[] = [];
        for (const g of asList(d.athletes)) {
          const gd = asDict(g);
          if (Array.isArray(gd.items)) flat.push(...asList(gd.items).map(asDict));
          else flat.push(gd);
        }
        for (const p of flat) {
          const pid = str(p.id);
          const name = str(p.displayName) ?? str(p.fullName);
          if (pid && name) players.push({ id: pid, name, team: side.abbr, pos: str(asDict(p.position).abbreviation) });
        }
      } catch {
        /* roster missing */
      }
    })
  );
  return {
    players,
    props: bundle.props.map((p) => ({ athleteId: p.athleteId, name: p.name, team: p.team, market: p.market, line: p.line, openLine: p.openLine })),
  };
}
