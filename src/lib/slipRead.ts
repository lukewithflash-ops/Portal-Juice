import "server-only";
import { getLive } from "@/lib/espn";
import { LEAGUES, parseScoreboard, sportsDate } from "@/lib/slate";
import { SPORT_LEAGUES, parseSportScoreboard } from "@/lib/sports";
import { gradePick } from "@/lib/grade";
import { pickFromLeg } from "@/lib/legPick";
import { markPlus } from "@/lib/plusLegs";
import { lineIssue, lineOk, plusLine, rereadLine } from "@/lib/lineSanity";
import {
  BASKETBALL,
  TENNIS,
  easternDate,
  gameOptions,
  gradeTennis,
  matchRow,
  nameClose,
  normalizeSlipText,
  parseSlipRows,
  propMarketOf,
  slipDateOf,
  rowSport,
  teamScore,
  type FoundPlayer,
  type ImportLeg,
  type SlateGame,
  type SlipKind,
  type SlipRow,
  salvageJson,
  expandNickname,
  leagueFromTeams,
  findTeamGames,
  markNote,
  isWinnerMarket,
} from "@/lib/slipImport";

const GATEWAY = "https://ai-gateway.vercel.sh/v1/chat/completions";
const MODEL = process.env.AI_GATEWAY_MODEL || "google/gemini-2.5-flash";
/** Second try when the first model errors, times out or returns broken JSON. */
const FALLBACK_MODEL = process.env.AI_GATEWAY_FALLBACK_MODEL || "openai/gpt-4.1-mini";
/** ESPN search "league" slug → our league id, for every league we cover. */
const LEAGUE_OF: Record<string, string> = Object.fromEntries([
  ...LEAGUES.map((l) => [l.slug, l.id]),
  ...SPORT_LEAGUES.map((l) => [l.path.split("/")[1], l.id]),
]);

function addDays(day: string, n: number): string {
  const d = new Date(Date.UTC(Number(day.slice(0, 4)), Number(day.slice(4, 6)) - 1, Number(day.slice(6, 8)) + n));
  return d.toISOString().slice(0, 10).replace(/-/g, "");
}

/** How far the matcher looks: two weeks back (settled slips) through two weeks ahead (futures). */
export const WINDOW_BACK = 14;
export const WINDOW_AHEAD = 14;
const ESPN = "https://site.api.espn.com/apis/site/v2/sports/";
const COLLEGE_HOOPS = new Set(["ncaam", "ncaaw"]);

async function fetchBoard(url: string, past: boolean): Promise<unknown | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000), headers: { "user-agent": "PortalJuice/1.0" }, next: { revalidate: past ? 1800 : 120 } });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

/** Days (YYYYMMDD) the window covers, plus a day either side of any date printed on the slip. */
export function windowDays(today: string, printed: string[] = []): string[] {
  const days = new Set<string>();
  for (let n = -WINDOW_BACK; n <= WINDOW_AHEAD; n++) days.add(addDays(today, n));
  for (const p of printed) {
    const d = p.replace(/-/g, "");
    if (!/^\d{8}$/.test(d)) continue;
    // Only dates within ~two months: a misread year should not pull a season of games.
    const gap = Math.abs(Date.parse(p + "T12:00:00Z") - Date.parse(`${today.slice(0, 4)}-${today.slice(4, 6)}-${today.slice(6)}T12:00:00Z`));
    if (!(gap < 62 * 864e5)) continue;
    for (const n of [-1, 0, 1]) days.add(addDays(d, n));
  }
  return [...days].sort();
}

const memo = new Map<string, { at: number; value: Promise<SlateGame[]> }>();

/**
 * Every game in the window, every league we cover. One call per league per month (ESPN takes YYYYMM),
 * day by day only where a month is too big (college football, college basketball in season).
 */
export async function windowGames(printed: string[] = []): Promise<SlateGame[]> {
  const today = sportsDate();
  const days = windowDays(today, printed);
  const key = days[0] + days[days.length - 1] + days.length;
  const hit = memo.get(key);
  if (hit && Date.now() - hit.at < 60_000) return hit.value;
  const value = loadWindow(today, days);
  memo.set(key, { at: Date.now(), value });
  if (memo.size > 20) memo.delete(memo.keys().next().value as string);
  value.catch(() => memo.delete(key));
  return value;
}

async function loadWindow(today: string, days: string[]): Promise<SlateGame[]> {
  const set = new Set(days);
  const months = [...new Set(days.map((d) => d.slice(0, 6)))];
  const inWindow = (iso: string) => {
    const e = easternDate(iso).replace(/-/g, "");
    return set.has(e);
  };
  const isPast = (d: string) => d < today;
  const src = (u: string, past: boolean): [string, boolean] => [u, past];
  const monthPast = (m: string) => m < today.slice(0, 6);
  const core = LEAGUES.map(async (l): Promise<SlateGame[]> => {
    const urls =
      l.id === "ncaaf"
        ? days.map((d) => src(`${ESPN}${l.sport}/${l.slug}/scoreboard?dates=${d}&groups=80&limit=300`, isPast(d)))
        : months.map((m) => src(`${ESPN}${l.sport}/${l.slug}/scoreboard?dates=${m}&limit=1000`, monthPast(m)));
    const boards = await Promise.all(urls.map(([u, past]) => fetchBoard(u, past)));
    return boards.flatMap((b) =>
      b
        ? parseScoreboard(l, b).games.map((g) => ({
            league: g.league,
            id: g.id,
            start: g.start,
            state: g.state,
            away: { id: g.away.id, abbr: g.away.abbr, name: g.away.name },
            home: { id: g.home.id, abbr: g.home.abbr, name: g.home.name },
          }))
        : []
    );
  });
  const extra = SPORT_LEAGUES.filter((l) => l.kind !== "golf").map(async (l): Promise<SlateGame[]> => {
    const inSeason = (m: string) => [11, 12, 1, 2, 3, 4].includes(Number(m.slice(4)));
    const urls = COLLEGE_HOOPS.has(l.id)
      ? months.flatMap((m) =>
          inSeason(m)
            ? days.filter((d) => d.startsWith(m)).map((d) => src(`${ESPN}${l.path}/scoreboard?dates=${d}&groups=50&limit=400`, isPast(d)))
            : [src(`${ESPN}${l.path}/scoreboard?dates=${m}&groups=50&limit=1000`, monthPast(m))]
        )
      : months.map((m) => src(`${ESPN}${l.path}/scoreboard?dates=${m}&limit=1000`, monthPast(m)));
    const boards = await Promise.all(urls.map(([u, past]) => fetchBoard(u, past)));
    return boards.flatMap((b) => {
      if (!b) return [];
      try {
        return parseSportScoreboard(l, b, Date.now(), { all: true }).matches.map(
          (m): SlateGame => ({
            league: l.id,
            id: m.id,
            start: m.start,
            state: m.state,
            away: { id: m.away.id, abbr: m.away.short, name: m.away.name },
            home: { id: m.home.id, abbr: m.home.short, name: m.home.name },
            ...(l.kind === "tennis" ? { sets: { away: m.away.sets, home: m.home.sets }, winner: m.home.winner ? "home" : m.away.winner ? "away" : null, event: m.event } : {}),
          })
        );
      } catch {
        return [];
      }
    });
  });
  const all = (await Promise.all([...core, ...extra])).flat();
  const seen = new Set<string>();
  return all.filter((g) => {
    const k = g.league + g.id;
    if (seen.has(k) || !inWindow(g.start)) return false;
    seen.add(k);
    return true;
  });
}

/** Back-compat: the window, today first. */
export async function upcomingGames(): Promise<SlateGame[]> {
  return windowGames();
}

const HOOP_PATH: Record<string, string> = {
  nba: "basketball/nba",
  wnba: "basketball/wnba",
  ncaam: "basketball/mens-college-basketball",
  ncaaw: "basketball/womens-college-basketball",
};

async function roster(league: string, teamId: string): Promise<{ id: string; name: string }[]> {
  const path = HOOP_PATH[league];
  if (!path || !/^\d+$/.test(teamId)) return [];
  try {
    const res = await fetch(`${ESPN}${path}/teams/${teamId}/roster`, { signal: AbortSignal.timeout(6000), next: { revalidate: 21600 } });
    if (!res.ok) return [];
    const d = (await res.json()) as { athletes?: { id?: string; displayName?: string; fullName?: string; items?: { id?: string; displayName?: string }[] }[] };
    // Most rosters are a flat list; some group by position.
    const flat = (d.athletes ?? []).flatMap((a) => (Array.isArray(a.items) ? a.items : [a]));
    return flat.filter((a) => a.id && (a.displayName || (a as { fullName?: string }).fullName)).map((a) => ({ id: String(a.id), name: String(a.displayName ?? (a as { fullName?: string }).fullName) }));
  } catch {
    return [];
  }
}

/**
 * Basketball: look the name up on the rosters of teams that play in the window (every basketball league,
 * preseason and the new season included). A printed team or opponent narrows the teams first.
 */
export async function rosterPlayer(row: SlipRow, games: SlateGame[], max = 48): Promise<FoundPlayer | null> {
  const lg = (row.league ?? "").toLowerCase();
  const hoops = games.filter((g) => (lg && BASKETBALL.has(lg) ? g.league === lg : BASKETBALL.has(g.league)));
  if (!hoops.length) return null;
  const hint = [row.team, row.opponent].filter(Boolean).join(" ");
  const at = row.date ? Date.parse(row.date + "T23:00:00Z") : Date.now();
  const teams: { league: string; id: string; score: number; dist: number }[] = [];
  for (const g of hoops) {
    for (const t of [g.home, g.away]) {
      const score = hint ? teamScore(hint, t) : 0;
      const dist = Math.abs(Date.parse(g.start) - at);
      const have = teams.find((x) => x.league === g.league && x.id === t.id);
      if (have) {
        have.dist = Math.min(have.dist, dist);
        have.score = Math.max(have.score, score);
      } else teams.push({ league: g.league, id: t.id, score, dist });
    }
  }
  // Pro leagues before college (smaller, likelier), then printed team, then closest game.
  const pro = (l: string) => (l === "nba" || l === "wnba" ? 0 : 1);
  teams.sort((a, b) => b.score - a.score || pro(a.league) - pro(b.league) || a.dist - b.dist);
  const pickTeams = teams.slice(0, max);
  for (let i = 0; i < pickTeams.length; i += 16) {
    const chunk = pickTeams.slice(i, i + 16);
    const lists = await Promise.all(chunk.map((t) => roster(t.league, t.id)));
    for (let j = 0; j < chunk.length; j++) {
      const p = lists[j].find((a) => nameClose(a.name, row.subject));
      if (p) return { id: p.id, name: p.name, league: chunk[j].league, teamId: chunk[j].id };
    }
  }
  return null;
}

type SearchItem = { id?: string; displayName?: string; league?: string; sport?: string; teamRelationships?: { core?: { id?: string } }[] };

async function searchPlayers(q: string): Promise<FoundPlayer[]> {
  try {
    const res = await fetch(`https://site.web.api.espn.com/apis/common/v3/search?query=${encodeURIComponent(q)}&limit=10&type=player`, {
      signal: AbortSignal.timeout(6000),
      next: { revalidate: 3600 },
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { items?: SearchItem[] };
    const items = data.items ?? [];
    // Soccer search lists a player under his national team; look up his club instead.
    const soccer = await Promise.all(
      items
        .filter((it) => it.sport === "soccer" && it.id && !LEAGUE_OF[String(it.league ?? "")])
        .slice(0, 3)
        .map(async (it) => {
          const club = await soccerClub(String(it.id));
          return club ? ({ id: String(it.id), name: String(it.displayName ?? ""), league: "soccer", teamId: club } as FoundPlayer) : null;
        })
    );
    const clubHits = soccer.filter((x): x is FoundPlayer => !!x);
    return [...clubHits, ...items
      .map((it) => ({
        id: String(it.id ?? ""),
        name: String(it.displayName ?? ""),
        league: LEAGUE_OF[String(it.league ?? "")] ?? "",
        teamId: it.teamRelationships?.[0]?.core?.id ? String(it.teamRelationships[0].core.id) : null,
      }))
      .filter((h) => h.id && h.league)];
  } catch {
    return [];
  }
}

async function soccerClub(id: string): Promise<string | null> {
  try {
    const res = await fetch(`https://site.web.api.espn.com/apis/common/v3/sports/soccer/athletes/${id}`, { signal: AbortSignal.timeout(6000), next: { revalidate: 21600 } });
    if (!res.ok) return null;
    const d = (await res.json()) as { athlete?: { team?: { id?: string } } };
    return d.athlete?.team?.id ? String(d.athlete.team.id) : null;
  } catch {
    return null;
  }
}

/**
 * ESPN player search across every league we cover. Prefers a hit whose team plays in the window.
 * If the full name finds nothing (a typo, a missing accent), retries by last name and keeps close spellings.
 */
export async function findPlayer(name: string, games: SlateGame[]): Promise<FoundPlayer | null> {
  const q = name.trim();
  if (q.length < 3) return null;
  let hits = await searchPlayers(q);
  if (!hits.length) {
    const last = q.split(/\s+/).pop() ?? "";
    if (last.length >= 3) hits = (await searchPlayers(last)).filter((h) => nameClose(h.name, q));
  }
  const isSoccer = (lg: string) => SPORT_LEAGUES.some((l) => l.id === lg && l.kind === "soccer");
  const sameLeague = (h: FoundPlayer, g: SlateGame) => g.league === h.league || (h.league === "soccer" && isSoccer(g.league));
  const order = (g: SlateGame) => (g.state === "in" ? 0 : g.state === "pre" ? 1 : 2);
  // Only people whose name matches what was printed: search also returns loose matches.
  hits = hits.filter((h) => nameClose(h.name, q));
  for (const h of hits) {
    if (!h.teamId) continue;
    const g = games.filter((x) => sameLeague(h, x) && (x.home.id === h.teamId || x.away.id === h.teamId)).sort((a, b) => order(a) - order(b))[0];
    if (g) return { ...h, league: g.league };
  }
  return hits.find((h) => h.league !== "soccer") ?? null;
}

/** A prop's player: ESPN search first (checked against the window), then basketball rosters, never a guess. */
async function propPlayer(row: SlipRow, games: SlateGame[]): Promise<FoundPlayer | null> {
  const sport = rowSport(row);
  if (sport === "tennis") return null; // tennis players are matched against the match entrants
  const hit = await findPlayer(row.subject, games);
  const plays = (h: FoundPlayer | null) => !!h?.teamId && games.some((g) => g.league === h.league && (g.home.id === h.teamId || g.away.id === h.teamId));
  if (hit && plays(hit) && (!row.league || row.league === hit.league || !BASKETBALL.has(row.league))) return hit;
  // Search can lag a trade or a new season; rosters are current. Basketball, or no sport printed.
  if (sport === "basketball" || !row.league || BASKETBALL.has(row.league)) {
    const r = await rosterPlayer(row, games);
    if (r) return r;
  }
  // A hit from another league than the slip names is someone else.
  return hit && (!row.league || row.league === hit.league) ? hit : null;
}

/** Grade a finished leg from ESPN: the final box for props, the final score for sides and totals. */
async function gradeLeg(leg: ImportLeg, games: SlateGame[]): Promise<"win" | "loss" | "push" | null> {
  if (!leg.leg || !leg.game || leg.game.state !== "post") return null;
  const g = games.find((x) => x.league === leg.game!.league && x.id === leg.game!.id);
  if (!g) return null;
  if (TENNIS.has(g.league)) return gradeTennis(leg.leg, g);
  try {
    const snap = await getLive(g.league, g.id);
    if (!snap || snap.state !== "post") return null;
    const pick = pickFromLeg(leg.row.kind === "prop" ? { ...leg.leg, market: leg.row.market } : leg.leg, { home: g.home.abbr, away: g.away.abbr });
    const r = gradePick(pick, snap);
    return r === "win" || r === "loss" || r === "push" ? r : null;
  } catch {
    return null;
  }
}

export async function matchRows(rows: SlipRow[], slipDate: string | null = null): Promise<ImportLeg[]> {
  const list = rows
    .slice(0, 20)
    .map((r) => (r.kind === "prop" && isWinnerMarket(r.market) ? { ...r, kind: "moneyline" as const, market: "moneyline", line: null, selection: null } : r))
    .map((r) => (slipDate && !r.date ? { ...r, date: slipDate } : r));
  const printed = list.map((r) => r.date).filter((d): d is string => !!d);
  const games = await windowGames(printed);
  const now = Date.now();
  // Two passes: legs that name one league for sure ("Lakers", a player) tell the matcher which league "LA" or "Kings" is.
  const sure = list.flatMap((r) => {
    if (r.leagueLocked && r.league) return [r.league];
    if (r.kind === "prop") return [];
    const hits = findTeamGames(r.subject, r.league ? games.filter((g) => g.league === r.league) : games);
    const top = hits.filter((h) => h.score === hits[0]?.score);
    const lgs = new Set(top.map((h) => h.game.league));
    return lgs.size === 1 ? [...lgs] : [];
  });
  return Promise.all(
    list.map(async (rIn) => {
      const r0 = { ...rIn, slipLeagues: sure.length ? sure : undefined };
      // The matchup printed beside a leg names its league ("PHI vs BOS" on a Friday is the NBA game).
      const lg = leagueFromTeams(r0, games);
      const r = lg ? { ...r0, league: lg } : r0;
      let player = r.kind === "prop" ? await propPlayer({ ...r, subject: expandNickname(r.subject) }, games) : null;
      let m = matchRow(r, games, player, now);
      // A league the reader guessed wrong ("WNBA + NBA" header) must not hide the player: try the matchup's league, then any.
      if (!m.game && r0.league && !r0.leagueLocked) {
        const r2 = { ...r0, league: leagueFromTeams({ ...r0, league: null }, games) };
        player = r2.kind === "prop" ? await propPlayer({ ...r2, subject: expandNickname(r2.subject) }, games) : null;
        const m2 = matchRow(r2, games, player, now);
        if (m2.game) m = { ...m2, row: r0 };
      }
      // A line outside the stat's range is flagged, never saved quietly.
      if (m.row.kind === "prop" && m.row.line != null) {
        const bad = lineIssue(m.game?.league ?? m.leg?.league ?? m.row.league, m.row.market, m.row.line);
        if (bad) m = { ...m, issue: m.issue ? `${bad} ${m.issue}` : bad };
      }
      const result = await gradeLeg(m, games);
      // The slip's own check mark is a hint, never a grade: ESPN's final decides, and a disagreement is said out loud.
      const note = markNote(result, r0.mark ?? null, !m.game);
      if (note) m = { ...m, issue: [m.issue, note].filter(Boolean).join(" ") };
      return result ? { ...m, result } : m;
    })
  );
}

/** Games for the "Match it" picker on a row the reader could not tie (and for a manual re-pick). */
export async function optionsFor(row: SlipRow): Promise<ReturnType<typeof gameOptions>> {
  const games = await windowGames(row.date ? [row.date] : []);
  return gameOptions(row, games, Date.now(), 20);
}

export type VisionResult = { ok: true; rows: SlipRow[]; stake: number | null; book?: string | null; text: string; date?: string | null } | { ok: false; reason: string; status?: number; detail?: string };

function gatewayAuth(oidcHeader: string | null): string | null {
  return process.env.AI_GATEWAY_API_KEY || oidcHeader || process.env.VERCEL_OIDC_TOKEN || null;
}

export function visionConfigured(oidcHeader: string | null): boolean {
  return Boolean(gatewayAuth(oidcHeader));
}

/** "Thu 2026-10-15 (yesterday), Fri 2026-10-16 (today), Sat 2026-10-17 …" around today, so a bare weekday maps to one date. */
function calendar(today: string): string {
  const base = Date.parse(today + "T12:00:00Z");
  const out: string[] = [];
  for (let d = -6; d <= 6; d++) {
    const t = new Date(base + d * 86400000);
    const wd = t.toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" });
    const tag = d === 0 ? " (today)" : d === -1 ? " (yesterday)" : d === 1 ? " (tomorrow)" : d < 0 ? " (last)" : "";
    out.push(`${wd} ${t.toISOString().slice(0, 10)}${tag}`);
  }
  return out.join(", ");
}

function prompt(today: string): string {
  return `You read sportsbook and pick'em slip screenshots (PrizePicks, Underdog, DraftKings, FanDuel, BetMGM, Caesars, ESPN Bet, Fliff, Sleeper and similar). Copy ONLY what is printed. Never guess or add anything.
Today is ${today}. Use it only to turn printed words like "Today", "Tomorrow", "Fri", "10/14" or "Oct 14" into a YYYY-MM-DD date.
Weekday calendar (a bare weekday means the date in this list; past weekdays for finished legs, coming ones for open legs): ${calendar(today)}.
Return JSON:
{"legs":[{"subject":string,"kind":"prop"|"spread"|"total"|"moneyline","market":string,"line":number|null,"line_text":string|null,"side":"over"|"under"|null,"odds":number|null,"league":string|null,"date":string|null,"team":string|null,"opponent":string|null,"settled":boolean,"sport":"tennis"|"mma"|"team"|null,"result":"won"|"lost"|"push"|null}],"stake":null,"book":string|null,"entry":string|null,"date":string|null,"lines":[string]}
Read EVERY leg on the slip, top to bottom, even when there are many (up to 20). Each player block on a pick'em slip is one leg. Each line of a parlay or same-game parlay is one leg.
- subject: the player for props (full name as printed), the team for spread/moneyline, the matchup ("AWAY @ HOME") for game totals. Tennis: the player.
- Keep each leg's own details together: the matchup, date and teams for a leg come from that leg's own row or the game header it sits under, never from a neighboring leg.
- market: the stat as printed for props (e.g. "Points", "Pts+Rebs+Asts", "3-PT Made", "Passing Yards", "Aces", "Total Games", "Games Won", "Double Faults", "Fantasy Score", "Break Points Won"); "spread", "moneyline" or "total" otherwise.
- line: the number for that leg (spread keeps its sign). null if not printed. Demon/goblin/discounted lines: use the number shown.
- "X+" means at least X: "1+ Shots on Goal" is line 0.5 side over, "2+ Hits" is line 1.5 side over, "25+ Points" is 24.5 over.
- The line is the stat number printed with the stat or the More/Less (Over/Under) choice. NEVER use a jersey number ("#22", "No. 22"), odds ("+150", "-110"), a payout multiplier ("3x", "10x"), a pick or player count ("5 picks", "5-pick"), a game clock or time, a score, a live stat progress number ("0/1", "3 of 5"), or a projection/average label.
- line_text: the line exactly as printed, e.g. "1+", "0.5", "24.5", "O 1.5". null if not printed.
- side: "More", "Higher", "Over", an up arrow, or "O 24.5" means over; "Less", "Lower", "Under", a down arrow, or "U 24.5" means under. Moneyline and spread: null.
- odds: American odds for that leg if printed, else null. Never use the combined parlay odds for a leg.
- league: the league if printed or plain from the slip (logos, team names, "NBA", "WNBA", "NCAAB", "NCAAW", "NFL", "CFB", "MLB", "NHL", "ATP", "WTA", "EPL", "MLS", "UFC"), else null.
- date: the game date as YYYY-MM-DD when printed for that leg (or its game header), else null.
- team / opponent: teams or players printed beside the leg ("LAL vs DEN", "@ BOS", "vs C. Alcaraz"). team = the subject's side, opponent = the other side. null if not printed.
- Matchup rows: many apps print, under each leg, a row with BOTH sides (flags or logos, "Final" or a time). That row belongs to the leg directly above it. team = the side named like the subject, opponent = the OTHER name in that row, copied as printed (a cut-off name like "Giusti..." stays "Giusti..."). Example: leg "Z. Piros / Winner" over row "Piros  Final  Giusti..." → subject "Z. Piros", kind "moneyline", team "Piros", opponent "Giusti...".
- "Winner" or "To Win" under a player's name is a moneyline leg.
- sport: "tennis" when legs are single players with country flags, a "Winner" market, or tennis stats; "mma" for fighters (UFC, "by KO/TKO", "by Decision"); "team" for team sports; null if you can't tell.
- settled: true only if the slip marks that leg finished (a check, an X, "Won", "Lost", "Final" in its row, or the slip sits on a "Settled" tab). Otherwise false.
- result: "won" for a green check or "Won", "lost" for a red X or "Lost", "push" for "Push"/"Void", else null.
- stake: always null. Ignore "$X to win $Y", payouts and entry fees.
- book: the app name if visible, else null. entry: the entry type if printed ("Power Play", "Flex Play", "Parlay", "SGP", "Champions"), else null.
- date (top level): a date printed for the whole slip (placed or game date), YYYY-MM-DD, else null.
- lines: the text lines you can read, top to bottom (at most 40; skip ads, banners and repeated payout text).
If the image is not a bet slip, return {"legs":[],"stake":null,"lines":[]}.`;
}

const LEAGUE_ALIASES: [RegExp, string][] = [
  [/^nba$/i, "nba"], [/^wnba$/i, "wnba"], [/^(ncaab|ncaam|cbb|ncaa\s*m(en'?s)?\s*b(asket)?b(all)?|college basketball)$/i, "ncaam"], [/^(ncaaw|wcbb|ncaa\s*w)/i, "ncaaw"],
  [/^nfl$/i, "nfl"], [/^(cfb|ncaaf|college football)$/i, "ncaaf"], [/^mlb$/i, "mlb"], [/^nhl$/i, "nhl"],
  [/^atp/i, "atp"], [/^wta/i, "wta"], [/^(epl|premier league)$/i, "epl"], [/^mls$/i, "mls"], [/^(ucl|champions league)$/i, "ucl"],
  [/^la\s*liga$/i, "laliga"], [/^serie\s*a$/i, "seriea"], [/^bundesliga$/i, "bundesliga"], [/^(ufc|mma)$/i, "ufc"],
];
export function leagueId(raw: unknown): string | null {
  const t = typeof raw === "string" ? raw.trim() : "";
  if (!t) return null;
  for (const [re, id] of LEAGUE_ALIASES) if (re.test(t)) return id;
  return null;
}
const isoDate = (v: unknown): string | null => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v.trim()) ? v.trim() : null);
const txt = (v: unknown, n = 60): string | null => (typeof v === "string" && v.trim() ? v.trim().slice(0, n) : null);

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v.trim() && Number.isFinite(Number(v.replace(/[+$,]/g, ""))) ? Number(v.replace(/[$,]/g, "")) : null);

/** Reads a slip photo with a vision model via Vercel AI Gateway. Extraction only. One retry on a hiccup, on a second model. */
export async function readSlipImage(dataUrl: string, oidcHeader: string | null): Promise<VisionResult> {
  const auth = gatewayAuth(oidcHeader);
  if (!auth) return { ok: false, reason: "not-configured" };
  const started = Date.now();
  const first = await readOnce(dataUrl, auth, MODEL, 45_000);
  if (first.ok || first.reason === "not-authorized" || first.reason === "no-credit") return first;
  const left = 80_000 - (Date.now() - started);
  if (left < 15_000) return first;
  const second = await readOnce(dataUrl, auth, FALLBACK_MODEL, Math.min(left, 40_000));
  return second.ok ? second : first;
}

async function readOnce(dataUrl: string, auth: string, model: string, timeout: number): Promise<VisionResult> {
  try {
    const res = await fetch(GATEWAY, {
      method: "POST",
      signal: AbortSignal.timeout(timeout),
      headers: { "content-type": "application/json", authorization: `Bearer ${auth}` },
      body: JSON.stringify({
        model,
        temperature: 0,
        max_tokens: 8000,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: prompt(new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" })) },
          { role: "user", content: [{ type: "text", text: "Read every leg on this slip." }, { type: "image_url", image_url: { url: dataUrl } }] },
        ],
      }),
    });
    if (!res.ok) {
      const body = (await res.text()).slice(0, 300);
      console.log(JSON.stringify({ event: "slip.vision", model, status: res.status, body }));
      let detail = "";
      try {
        const j = JSON.parse(body) as { error?: { message?: string; type?: string } | string };
        detail = typeof j.error === "string" ? j.error : [j.error?.type, j.error?.message].filter(Boolean).join(": ");
      } catch {
        detail = body;
      }
      return { ok: false, status: res.status, detail: detail.replace(/[A-Za-z0-9_-]{32,}/g, "…").slice(0, 240), reason: res.status === 401 || res.status === 403 ? "not-authorized" : res.status === 402 ? "no-credit" : `error-${res.status}` };
    }
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[]; usage?: unknown };
    console.log(JSON.stringify({ event: "slip.vision", status: 200, model, usage: data.usage ?? null }));
    const content = data.choices?.[0]?.message?.content ?? "";
    const json = salvageJson(content) as { legs?: unknown[]; stake?: unknown; lines?: unknown[]; book?: unknown; entry?: unknown; date?: unknown } | null;
    if (!json) {
      console.log(JSON.stringify({ event: "slip.vision", model, error: "bad-json", tail: content.slice(-120) }));
      return { ok: false, reason: "bad-json" };
    }
    const lines = (json.lines ?? []).filter((x): x is string => typeof x === "string").slice(0, 80);
    const text = lines.join("\n");
    const rows: SlipRow[] = [];
    for (const raw of json.legs ?? []) {
      if (!raw || typeof raw !== "object") continue;
      const l = raw as Record<string, unknown>;
      const subject = typeof l.subject === "string" ? l.subject.trim().slice(0, 60) : "";
      const kind0 = (["prop", "spread", "total", "moneyline"] as const).includes(l.kind as SlipKind) ? (l.kind as SlipKind) : null;
      // "Winner" / "To Win" under a name is a moneyline, whatever kind the reader picked.
      const kind = kind0 && isWinnerMarket(String(l.market ?? "")) ? "moneyline" : kind0;
      if (!subject || !kind) continue;
      const market = kind === "prop" ? propMarketOf(String(l.market ?? "")) || String(l.market ?? "").toLowerCase().slice(0, 40) : kind;
      const side = String(l.side ?? "").toLowerCase();
      const odds = num(l.odds);
      // "1+" printed: over 0.5, whatever number the model put in line.
      const plus = kind === "prop" || kind === "total" ? plusLine(typeof l.line_text === "string" ? l.line_text : null) : null;
      let line = kind === "moneyline" ? null : plus ?? num(l.line);
      let sideFix: "Over" | null = plus != null ? "Over" : null;
      const lg0 = leagueId(l.league);
      // Out of range for the stat (a jersey number, odds, a count): re-read it from the slip text, else matchRows flags it.
      if (kind === "prop" && line != null && !lineOk(lg0, market, line)) {
        const again = rereadLine(text, subject, lg0, market) ?? (typeof l.line_text === "string" ? rereadLine(subject + "\n" + l.line_text, subject, lg0, market) : null);
        console.log(JSON.stringify({ event: "slip.line-reread", subject, market, read: line, text: l.line_text ?? null, fixed: again?.line ?? null }));
        if (again) {
          line = again.line;
          if (again.over) sideFix = "Over";
        }
      }
      rows.push({
        subject,
        kind,
        market,
        line,
        selection: kind === "prop" || kind === "total" ? (sideFix ?? (/^(over|more|higher|o)$/.test(side) ? "Over" : /^(under|less|lower|u)$/.test(side) ? "Under" : null)) : null,
        odds: odds != null && Math.abs(odds) >= 100 && Math.abs(odds) < 100000 ? Math.round(odds) : null,
        league: leagueId(l.league),
        date: isoDate(l.date),
        team: txt(l.team),
        opponent: txt(l.opponent),
        settled: l.settled === true,
        sport: l.sport === "tennis" || l.sport === "mma" || l.sport === "team" ? l.sport : null,
        mark: l.result === "won" ? "win" : l.result === "lost" ? "loss" : l.result === "push" ? "push" : null,
        ...(plus != null && line === plus ? { plus: true } : {}),
      });
    }
    const book = [typeof json.book === "string" ? json.book.slice(0, 20) : "", typeof json.entry === "string" ? json.entry.slice(0, 20) : ""].filter(Boolean).join(" · ") || null;
    // No money in records: stake and payout text are dropped.
    return { ok: true, rows: rows.slice(0, 20), stake: null, book, text, date: isoDate(json.date) };
  } catch (err) {
    const msg = String((err as Error).message).slice(0, 200);
    console.log(JSON.stringify({ event: "slip.vision", model, error: msg }));
    return { ok: false, reason: /abort|timeout/i.test(msg) ? "timeout" : "error" };
  }
}

export function rowsFromText(text: string): { rows: SlipRow[]; stake: number | null; date: string | null } {
  const rows = parseSlipRows(text);
  // One league named on the whole slip: a hint for every row.
  const named = [...new Set((text.match(/\b(NBA|WNBA|NCAAB|NCAAW|NFL|NCAAF|CFB|MLB|NHL|ATP|WTA|EPL|MLS|UFC)\b/g) ?? []).map((t) => leagueId(t)).filter(Boolean))];
  const league = named.length === 1 ? named[0] : null;
  const fixed = rows.map((r0) => {
    const r = league ? { ...r0, league: r0.league ?? league } : r0;
    if (r.kind !== "prop" || r.line == null || lineOk(r.league, r.market, r.line)) return r;
    const again = rereadLine(normalizeSlipText(text), r.subject, r.league, r.market);
    return again ? { ...r, line: again.line, selection: again.over ? ("Over" as const) : r.selection } : r;
  });
  return { rows: fixed.map((r) => markPlus(r, text)), stake: null, date: slipDateOf(text) };
}
