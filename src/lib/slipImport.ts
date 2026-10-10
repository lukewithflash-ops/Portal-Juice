/**
 * Slip import: rows read from a photo, link, or pasted text, matched to real games.
 * Pure. Nothing here invents a leg: a row only exists if its text was on the slip,
 * and anything we cannot tie to a game stays flagged for you to fix.
 */

import { statFromMarket, type LegInput } from "@/lib/breakdown";
import { marketTerms } from "@/lib/tracker";

const liveTrackable = (market: string) => marketTerms(market).length > 0;

export type SlipKind = "prop" | "spread" | "total" | "moneyline";

export type SlipRow = {
  subject: string;
  market: string;
  line: number | null;
  selection: "Over" | "Under" | null;
  odds: number | null;
  kind: SlipKind;
};

export type SlateGame = {
  league: string;
  id: string;
  start: string;
  state: "pre" | "in" | "post";
  away: { id: string; abbr: string; name: string };
  home: { id: string; abbr: string; name: string };
};

export type ImportLeg = {
  row: SlipRow;
  /** Null when the row is not tied to a game yet. */
  leg: LegInput | null;
  game: { league: string; id: string; away: string; home: string; start: string } | null;
  /** Why it is flagged, in plain words. Null when it is ready. A flag never blocks saving. */
  issue: string | null;
  /** True when the leg can be saved but has no live meter: graded by you. */
  manual?: boolean;
};

const PROP_MARKETS: [RegExp, string][] = [
  [/(?:goalie|goalkeeper|keeper|gk)\s*fantasy\s*(?:score|points|pts)?/i, "goalie fantasy score"],
  [/fantasy\s*(?:score|points|pts)?|\bfpts\b/i, "fantasy score"],
  [/\bpasses(?:\s+attempted)?\b/i, "passes attempted"],
  [/goals?\s*(?:allowed|conceded|against)/i, "goals allowed"],
  [/goal\s*\+\s*assist|goals?\s*(?:and|\+)\s*assists?/i, "goal + assist"],
  [/tackles?/i, "tackles"],
  [/clearances?/i, "clearances"],
  [/crosses/i, "crosses"],
  [/shots?\s*assisted|key\s*passes/i, "shots assisted"],
  [/longest\s+(?:rush|run)|long(?:est)?\s+rush/i, "longest rush"],
  [/longest\s+(?:reception|catch|rec)/i, "longest reception"],
  [/longest\s+(?:pass(?:ing)?\s+)?(?:completion|pass)/i, "longest completion"],
  [/pts\s*\+\s*reb(?:s)?\s*\+\s*ast(?:s)?|points\s*\+\s*rebounds\s*\+\s*assists|\bpra\b/i, "points + rebounds + assists"],
  [/pts\s*\+\s*reb(?:s)?|points\s*\+\s*rebounds/i, "points + rebounds"],
  [/pts\s*\+\s*ast(?:s)?|points\s*\+\s*assists/i, "points + assists"],
  [/reb(?:s|ounds)?\s*\+\s*ast(?:s|ists)?/i, "rebounds + assists"],
  [/rush(?:ing)?\s*\+\s*rec(?:eiving)?(?:\s+|-)?(?:y(?:ar)?ds?)?/i, "rushing + receiving yards"],
  [/pass(?:ing)?\s*\+\s*rush(?:ing)?(?:\s+|-)?(?:y(?:ar)?ds?)?/i, "passing + rushing yards"],
  [/pass(?:ing)?(?:\s+|-)?(?:td|touchdown)s?/i, "passing touchdowns"],
  [/pass(?:ing)?(?:\s+|-)?att(?:empt)?s?/i, "pass attempts"],
  [/pass(?:ing)?(?:\s+|-)?y(?:ar)?ds?/i, "passing yards"],
  [/rush(?:ing)?(?:\s+|-)?att(?:empt)?s?|\bcarries\b/i, "rush attempts"],
  [/rush(?:ing)?(?:\s+|-)?y(?:ar)?ds?/i, "rushing yards"],
  [/rec(?:eiving)?(?:\s+|-)?y(?:ar)?ds?/i, "receiving yards"],
  [/completions?\b|\bcmp\b/i, "completions"],
  [/receptions?\b|\bcatches\b/i, "receptions"],
  [/targets?\b/i, "targets"],
  [/interceptions?\b|\bints?\b/i, "interceptions"],
  [/3[- ]?(?:pointers?|pt|pts|pm)\b|threes?\b|3-?pt made/i, "3-pointers"],
  [/rebounds?\b|\brebs?\b/i, "rebounds"],
  [/assists?\b|\basts?\b/i, "assists"],
  [/steals?\s*\+\s*blocks?|stocks/i, "steals + blocks"],
  [/steals?\b/i, "steals"],
  [/blocks?\b|blocked shots/i, "blocks"],
  [/turnovers?\b/i, "turnovers"],
  [/strike\s*outs?|\bks?\b(?=.*\d)/i, "strikeouts"],
  [/total bases|\bbases\b/i, "total bases"],
  [/home runs?|\bhr\b/i, "home runs"],
  [/\bhits?\b/i, "hits"],
  [/\brbis?\b/i, "rbis"],
  [/shots? on (?:goal|target)|\bsog\b/i, "shots on goal"],
  [/\bsaves?\b/i, "saves"],
  [/\bgoals?\b/i, "goals"],
  [/\bpoints?\b|\bpts\b/i, "points"],
];

/** Stats you can pick when the slip's market wording is not read. Grouped by sport. */
export const STAT_CHOICES: Record<string, string[]> = {
  football: ["passing yards", "rushing yards", "receiving yards", "receptions", "targets", "completions", "pass attempts", "rush attempts", "passing touchdowns", "interceptions", "rushing + receiving yards", "passing + rushing yards", "longest rush", "longest reception", "longest completion", "fantasy score"],
  basketball: ["points", "rebounds", "assists", "3-pointers", "points + rebounds + assists", "points + rebounds", "points + assists", "rebounds + assists", "steals", "blocks", "steals + blocks", "turnovers", "fantasy score"],
  baseball: ["hits", "total bases", "home runs", "rbis", "strikeouts"],
  hockey: ["goals", "assists", "points", "shots on goal", "saves"],
  soccer: ["fantasy score", "goalie fantasy score", "passes attempted", "shots", "shots on target", "goals", "assists", "goal + assist", "tackles", "clearances", "crosses", "saves", "goals allowed", "shots assisted", "fouls"],
};

export function sportGroupOf(league: string): string {
  if (league === "nfl" || league === "ncaaf") return "football";
  if (["nba", "wnba", "ncaam", "ncaaw"].includes(league)) return "basketball";
  if (league === "mlb") return "baseball";
  if (league === "nhl") return "hockey";
  return "soccer";
}

const normName = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z ]/g, "").replace(/\b(jr|sr|ii|iii|iv)\b/g, "").replace(/\s+/g, " ").trim();

function lev(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}

/** Same person, allowing accents, suffixes, an initial for the first name, and a typo or two. */
export function nameClose(a: string, b: string): boolean {
  const x = normName(a);
  const y = normName(b);
  if (!x || !y) return false;
  if (x === y) return true;
  const [xf, ...xr] = x.split(" ");
  const [yf, ...yr] = y.split(" ");
  const xl = xr.join(" ");
  const yl = yr.join(" ");
  if (xl && xl === yl && (xf[0] === yf[0])) return true;
  return lev(x, y) <= Math.max(1, Math.floor(Math.min(x.length, y.length) / 6));
}

export function propMarketOf(text: string): string {
  for (const [re, label] of PROP_MARKETS) if (re.test(text)) return label;
  return "";
}

const clean = (s: string) => s.replace(/[^A-Za-z0-9 .'&@-]/g, " ").replace(/\s+/g, " ").trim();

/**
 * One row per line that has a name and something to bet on. Handles props ("Josh Allen Over 245.5 Passing Yards -115"),
 * spreads ("Chiefs -3.5 -110"), moneylines ("Lakers ML +150", "Lakers Moneyline"), and totals ("Over 47.5 Total Points").
 */
const BET_WORDS = /\b(over|under|spread|money\s?line|ml|total|run line|puck line|alt)\b|^\s*[ou]\s?\d|(?:^|\s)[+-]\d{1,2}(?:\.5)?(?:\s|$)/i;
const PRICE_ONLY = /^\s*([+-]\d{3,4}|even)\s*$/i;

/**
 * Many books print the name on one line and the bet under it ("Josh Allen  -115" / "Over 245.5 Passing Yards").
 * Join those pairs into one row of text. Lines that already read as a full bet stay as they are.
 */
export function joinSlipLines(raw: string): string[] {
  const lines = raw.split(/\n+/).map((l) => l.replace(/[−–—]/g, "-").replace(/\s+/g, " ").trim()).filter(Boolean);
  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const cur = lines[i];
    const next = lines[i + 1];
    const head = cur.replace(/(?:^|\s)([+-]\d{3,4}|even)\s*$/i, "").trim();
    const headIsName = /^[A-Za-z][A-Za-z .'&-]{2,40}$/.test(head) && !BET_WORDS.test(head) && head.split(" ").length <= 5;
    if (headIsName && next && BET_WORDS.test(next) && !/^[A-Za-z][A-Za-z .'-]+\s+(over|under)\b/i.test(next)) {
      const price = cur.slice(head.length).trim();
      let joined = `${head} ${next}${price ? " " + price : ""}`;
      i++;
      if (lines[i + 1] && PRICE_ONLY.test(lines[i + 1]) && !price) {
        joined += " " + lines[i + 1].trim();
        i++;
      }
      out.push(joined);
    } else if (PRICE_ONLY.test(cur) && out.length && !/[+-]\d{3,4}/.test(out[out.length - 1])) {
      out[out.length - 1] += " " + cur;
    } else out.push(cur);
  }
  return out;
}

export function parseSlipRows(raw: string): SlipRow[] {
  const rows: SlipRow[] = [];
  const seen = new Set<string>();
  for (const chunk of joinSlipLines(raw)) {
    let line = chunk.replace(/[−–—]/g, "-").replace(/\s+/g, " ").trim();
    if (line.length < 4) continue;
    // Price: a signed 3+ digit number (+150, -110), or "EVEN".
    let odds: number | null = null;
    const priceM = line.match(/(?:^|\s|\()([+-]\d{3,4})(?=\s|\)|$)/);
    if (priceM) {
      const n = Number(priceM[1]);
      if (n <= -100 || n >= 100) {
        odds = n;
        line = line.replace(priceM[1], " ");
      }
    } else if (/\beven\b/i.test(line)) {
      odds = 100;
      line = line.replace(/\beven\b/i, " ");
    }
    const sideM = line.match(/\b(over|under|o|u)\s?(?=\d|\s\d)/i) ?? line.match(/\b(over|under)\b/i);
    const sel = sideM ? (/^o/i.test(sideM[1]) ? "Over" : "Under") : null;
    const ml = /\b(ml|money\s?line|to win|winner)\b/i.test(line);
    const totalWord = /\b(total|game total|o\/u)\b/i.test(line);
    const market = propMarketOf(line);
    const spreadM = line.match(/(?:^|\s)([+-]\d{1,2}(?:\.5)?)(?=\s|$)/);
    const numM = line.match(/(\d+(?:\.\d+)?)/);

    let kind: SlipKind;
    let value: number | null = null;
    let subjectEnd: number;
    if (ml) {
      kind = "moneyline";
      subjectEnd = line.search(/\b(ml|money\s?line|to win|winner)\b/i);
    } else if (sel && market && !/total points|game total/i.test(line) && numM) {
      kind = "prop";
      value = Number(numM[1]);
      subjectEnd = Math.min(...[line.search(/\b(over|under)\b/i), line.search(/\b[ou]\s?\d/i), numM.index ?? 999].filter((x) => x >= 0));
    } else if (sel && numM && (totalWord || !market)) {
      kind = "total";
      value = Number(numM[1]);
      subjectEnd = line.search(/\b(over|under|o|u)\b/i);
    } else if (spreadM && spreadM.index != null && !sel) {
      kind = "spread";
      value = Number(spreadM[1]);
      subjectEnd = spreadM.index;
    } else continue;

    let subject = clean(line.slice(0, Math.max(0, subjectEnd)))
      .replace(/\b(spread|total|points?|alt|alternate|player|props?)\b/gi, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (kind === "total" && subject.length < 2) {
      // Totals often list the matchup after the number ("Over 47.5 KC @ BUF").
      subject = clean(line.slice((numM?.index ?? 0) + (numM?.[0].length ?? 0))).replace(/\b(total|points?|runs|goals)\b/gi, " ").replace(/\s+/g, " ").trim();
    }
    if (kind !== "total" && subject.length < 2) continue;
    if (value != null && !Number.isFinite(value)) continue;
    const row: SlipRow = { subject, market: kind === "prop" ? market : kind, line: value, selection: kind === "prop" || kind === "total" ? sel : null, odds, kind };
    const key = `${row.kind}|${subject.toLowerCase()}|${row.market}|${row.line}|${row.selection ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push(row);
  }
  return rows;
}

/** First "$25" / "Stake 25" / "Wager: 25.00" on the slip. Null when absent. */
export function stakeOf(raw: string): number | null {
  const m = raw.match(/(?:stake|wager|risk|bet amount)\s*:?\s*\$?\s*(\d+(?:\.\d{1,2})?)/i) ?? raw.match(/\$\s?(\d+(?:\.\d{1,2})?)\s*(?:stake|wager|risk|bet)/i);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) && n > 0 && n < 100000 ? n : null;
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();

/** How well text names a team: 3 exact abbr or full name, 2 nickname, 1 city word. 0 none. */
export function teamScore(text: string, t: { abbr: string; name: string }): number {
  const x = norm(text);
  if (!x) return 0;
  const name = norm(t.name);
  const words = name.split(" ");
  const nick = words[words.length - 1];
  const tokens = new Set(x.split(" "));
  if (x === name || x.includes(name) || tokens.has(t.abbr.toLowerCase())) return 3;
  if (nick.length >= 3 && tokens.has(nick)) return 2;
  if (words.length > 1 && words.slice(0, -1).join(" ").length >= 4 && x.includes(words.slice(0, -1).join(" "))) return 1;
  return 0;
}

/** Games where `text` names one side. Best score first; ties keep slate order (soonest). */
export function findTeamGames(text: string, games: SlateGame[]): { game: SlateGame; side: "home" | "away"; score: number }[] {
  const out: { game: SlateGame; side: "home" | "away"; score: number }[] = [];
  for (const g of games) {
    const h = teamScore(text, g.home);
    const a = teamScore(text, g.away);
    if (h || a) out.push({ game: g, side: h >= a ? "home" : "away", score: Math.max(h, a) });
  }
  return out.sort((p, q) => q.score - p.score);
}

/** Games where both teams are named (for totals). */
export function findBothTeams(text: string, games: SlateGame[]): SlateGame | null {
  return games.find((g) => teamScore(text, g.home) > 0 && teamScore(text, g.away) > 0) ?? null;
}

export type FoundPlayer = { id: string; name: string; league: string; teamId: string | null };

const gameRef = (g: SlateGame) => ({ league: g.league, id: g.id, away: g.away.abbr, home: g.home.abbr, start: g.start });

/** Ties one row to a game and a leg. `player` is the ESPN search hit for prop rows (or null). */
export function matchRow(row: SlipRow, games: SlateGame[], player: FoundPlayer | null): ImportLeg {
  const live = games.filter((g) => g.state !== "post");
  const pool = live.length ? live : games;
  const odds = row.odds;
  if (row.kind === "prop") {
    const known = propMarketOf(row.market);
    if (known) row = { ...row, market: known };
    if (!player) return { row, leg: null, game: null, manual: true, issue: "Player not found in today’s or upcoming games. Saves as a manual leg you grade." };
    const g = pool.find((x) => x.league === player.league && player.teamId && (x.home.id === player.teamId || x.away.id === player.teamId));
    if (!g) return { row, leg: null, game: null, manual: true, issue: `${player.name}’s team has no game in the next few days. Saves as a manual leg.` };
    const stat = statFromMarket(g.league, row.market);
    const leg: LegInput = {
      league: g.league,
      gameId: g.id,
      kind: "prop",
      athleteId: player.id,
      athleteName: player.name,
      market: row.market,
      stat: stat ?? undefined,
      line: row.line,
      pick: row.selection === "Under" ? "under" : "over",
      odds,
    };
    const tracked = row.market && liveTrackable(row.market);
    const issue = !row.market
      ? "Pick the stat. Until then it saves as a manual leg."
      : row.line == null
        ? "Add the line."
        : !row.selection
          ? "Pick over or under."
          : !tracked
            ? "No live meter for this stat. It saves as a manual leg you grade."
            : null;
    return { row, leg: { ...leg, athleteName: player.name }, game: gameRef(g), issue, manual: !tracked };
  }
  if (row.kind === "total") {
    const both = findBothTeams(row.subject, pool);
    const twoNamed = /\s(@|vs\.?|v\.?|at)\s/i.test(row.subject);
    const g = both ?? (twoNamed ? null : (findTeamGames(row.subject, pool)[0]?.game ?? null));
    if (!g) return { row, leg: null, game: null, issue: twoNamed ? "That matchup is not in today’s or upcoming games." : "Which game? Add the teams." };
    return {
      row,
      leg: { league: g.league, gameId: g.id, kind: "total", pick: row.selection === "Under" ? "under" : "over", line: row.line, odds },
      game: gameRef(g),
      issue: row.line == null ? "Add the line." : !row.selection ? "Pick over or under." : !both ? "Only one team named. Check the game." : null,
    };
  }
  const hits = findTeamGames(row.subject, pool);
  if (!hits.length) return { row, leg: null, game: null, issue: "Team not found in today’s or upcoming games." };
  const best = hits[0];
  const unsure = hits.length > 1 && hits[1].score === best.score && hits[1].game.id !== best.game.id;
  const t = best.side === "home" ? best.game.home : best.game.away;
  const leg: LegInput =
    row.kind === "spread"
      ? { league: best.game.league, gameId: best.game.id, kind: "spread", side: best.side, team: t.abbr, line: row.line, odds }
      : { league: best.game.league, gameId: best.game.id, kind: "moneyline", side: best.side, team: t.abbr, odds };
  return { row, leg, game: gameRef(best.game), issue: unsure ? "More than one game fits. Check the team." : null };
}
