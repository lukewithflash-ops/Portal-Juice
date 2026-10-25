/**
 * Slip import: rows read from a photo, link, or pasted text, matched to real games.
 * Pure. Nothing here invents a leg: a row only exists if its text was on the slip,
 * and anything we cannot tie to a game stays flagged for you to fix.
 */

import { statFromMarket, type LegInput } from "@/lib/breakdown";
import { trackableMarket } from "@/lib/tracker";
import { periodOf, stripPeriod, withPeriod, type PeriodCode } from "@/lib/periodStats";
import { findStatIn, notTrackableReason, resolveStat } from "@/lib/statAlias";
import { leaguesForMarket, leaguesForSpread, teamScoreLeague } from "@/lib/teamResolve";

const liveTrackable = (market: string, league?: string) => trackableMarket(market, league);

export type SlipKind = "prop" | "spread" | "total" | "moneyline";

export type SlipRow = {
  subject: string;
  market: string;
  line: number | null;
  selection: "Over" | "Under" | null;
  odds: number | null;
  kind: SlipKind;
  /** League as printed or implied (our id: nba, wnba, atp…). A hint only. */
  league?: string | null;
  /** Game date as printed, YYYY-MM-DD. A hint for which game. */
  date?: string | null;
  /** Team or opponent printed next to the leg ("LAL vs DEN"). Hints only. */
  team?: string | null;
  opponent?: string | null;
  /** Printed "X+" (at least X): line holds X - 0.5. False = you chose a plain over. */
  plus?: boolean;
  /** The slip marks this leg settled (a check, "Won", "Lost"). Only used to look at past games; never a grade. */
  settled?: boolean;
  /** Quarter or half the prop counts in ("2Q", "1H"). Null = the full game. Also carried in the market text. */
  period?: PeriodCode | null;
  /** Sport as read from the slip (flags + two players + "Winner" = tennis). A hint for matching. */
  sport?: "tennis" | "mma" | "team" | null;
  /** The slip's own mark (green check = win). A hint only: ESPN's final always decides. */
  mark?: "win" | "loss" | "push" | null;
  /** You picked the league on this leg: match only inside it. */
  leagueLocked?: boolean;
  /** Leagues of the slip's other legs (filled by the matcher). Breaks a tie between same-name teams. */
  slipLeagues?: string[];
};

export type SlateGame = {
  league: string;
  id: string;
  start: string;
  state: "pre" | "in" | "post";
  away: { id: string; abbr: string; name: string };
  home: { id: string; abbr: string; name: string };
  /** Tennis: set scores per side and the winner, from the scoreboard. */
  sets?: { away: string[]; home: string[] };
  winner?: "away" | "home" | null;
  event?: string | null;
};

export type GameRef = { league: string; id: string; away: string; home: string; start: string; state?: "pre" | "in" | "post"; awayName?: string; homeName?: string };

export type ImportLeg = {
  row: SlipRow;
  /** Null when the row is not tied to a game yet. */
  leg: LegInput | null;
  game: GameRef | null;
  /** Finished game: graded from the final ESPN score or box. Null = not graded (you grade it). */
  result?: "win" | "loss" | "push" | null;
  /** Unmatched rows: games in the window you can tie it to ("Match it"). */
  options?: GameRef[];
  /** Why it is flagged, in plain words. Null when it is ready. A flag never blocks saving. */
  issue: string | null;
  /** True when the leg can be saved but has no live meter: graded by you. */
  manual?: boolean;
};

const PROP_MARKETS: [RegExp, string][] = [
  // Tennis first: "games won" and "total games" must not read as goals or points.
  [/double\s*faults?/i, "double faults"],
  [/\baces?\b/i, "aces"],
  [/total\s*games|games\s*played/i, "total games"],
  [/games?\s*won/i, "games won"],
  [/sets?\s*won/i, "sets won"],
  [/total\s*sets|sets\s*played/i, "total sets"],
  [/break\s*points?\s*(?:won|converted)|\bbreaks?\s*of\s*serve|\bbreaks\b/i, "breaks"],
  [/free\s*throws?\s*made|\bftm\b/i, "free throws made"],
  [/blk?s?\s*\+\s*stl?s?|blocks?\s*\+\s*steals?/i, "steals + blocks"],
  [/(?:goalie|goalkeeper|keeper|gk)\s*fantasy\s*(?:score|points|pts)?/i, "goalie fantasy score"],
  [/fantasy\s*(?:score|points|pts)?|\bfpts\b/i, "fantasy score"],
  [/\bpasses(?:\s+attempted)?\b/i, "passes attempted"],
  [/goals?\s*(?:allowed|conceded|against)/i, "goals allowed"],
  [/goal\s*\+\s*assist|goals?\s*(?:and|\+)\s*assists?/i, "goal + assist"],
  [/solo\s*tackles?/i, "solo tackles"],
  [/tackles?(?:\s*\+\s*ast(?:s|ists)?)?/i, "tackles"],
  [/clearances?/i, "clearances"],
  [/crosses/i, "crosses"],
  [/shots?\s*assisted|key\s*passes/i, "shots assisted"],
  [/longest\s+(?:rush|run)|long(?:est)?\s+rush/i, "longest rush"],
  [/longest\s+(?:reception|catch|rec)/i, "longest reception"],
  [/longest\s+(?:pass(?:ing)?\s+)?(?:completion|pass)/i, "longest completion"],
  // Basketball shooting and box-score props (ESPN posts FG/3PT/FT as "made-attempted").
  [/\b3\s*-?\s*pta\b|\b3pa\b|\b3fga\b|3[- ]?(?:pt|point|pointers?)s?\s*(?:fg\s*|field\s*goals?\s*)?att(?:empt(?:ed|s)?)?\b|threes?\s+att(?:empt(?:ed|s)?)?|three[- ]point(?:ers?|\s*field\s*goals?|\s*shots?)?\s+att(?:empt(?:ed|s)?)?/i, "threes attempted"],
  [/field\s*goals?\s*att(?:empt(?:ed|s)?)?|\bfga\b|\bfg\s*att(?:empt(?:ed|s)?)?\b|shots?\s+attempted/i, "field goals attempted"],
  [/free\s*throws?\s*att(?:empt(?:ed|s)?)?|\bfta\b|\bft\s*att(?:empt(?:ed|s)?)?\b/i, "free throws attempted"],
  [/free\s*throws?(?:\s*made)?\b|\bftm\b|\bft\s*made\b/i, "free throws made"],
  [/offensive\s*rebounds?|\boff\.?\s*rebs?\b|\boreb?s?\b/i, "offensive rebounds"],
  [/defensive\s*rebounds?|\bdef\.?\s*rebs?\b|\bdrebs?\b/i, "defensive rebounds"],
  [/personal\s*fouls?|\bpfs?\b/i, "personal fouls"],
  [/blk?s?\s*\+\s*stl?s?|blocks?\s*\+\s*steals?|stls?\s*\+\s*blks?|\bs\s*\+\s*b\b|\bb\s*\+\s*s\b/i, "steals + blocks"],
  [/\bp\s*\+\s*r\s*\+\s*a\b/i, "points + rebounds + assists"],
  [/\bp\s*\+\s*r\b/i, "points + rebounds"],
  [/\bp\s*\+\s*a\b/i, "points + assists"],
  [/\br\s*\+\s*a\b/i, "rebounds + assists"],
  [/\btovs?\b/i, "turnovers"],
  [/(?:3[- ]?(?:pt|pointers?|point)s?|threes?|three[- ]pointers?)\s*made|\b3pm\b|\b3ptm\b/i, "3-pointers"],
  [/(?:basketball\s+)?field\s*goals?\s*made\s*\(?(?:hoops|nba|wnba)\)?/i, "field goals made"],
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
  [/completions?\b|\bcmp\b|\bcomps?\b/i, "completions"],
  [/receptions?\b|\bcatches\b|\brecs?\b/i, "receptions"],
  [/\bsacks?\b/i, "sacks"],
  [/field\s*goals?\s*made|\bfgm\b|\bfgs?\s*made\b/i, "field goals made"],
  [/kicking\s*(?:points|pts)/i, "kicking points"],
  [/extra\s*points?\s*made|\bxpm?\b/i, "extra points made"],
  [/\bh\s*\+\s*r\s*\+\s*rbis?\b|hits\s*\+\s*runs\s*\+\s*rbis?/i, "hits + runs + rbis"],
  [/earned\s*runs?(?:\s*allowed)?|\ber\b(?=.*\d)/i, "earned runs allowed"],
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
  football: ["passing yards", "rushing yards", "receiving yards", "receptions", "targets", "completions", "pass attempts", "rush attempts", "passing touchdowns", "rushing touchdowns", "receiving touchdowns", "rush + rec touchdowns", "anytime touchdown", "interceptions", "rushing + receiving yards", "passing + rushing yards", "longest rush", "longest reception", "longest completion", "tackles", "solo tackles", "assisted tackles", "sacks", "tackles for loss", "passes defended", "field goals made", "extra points made", "kicking points", "longest field goal", "fumbles lost", "fantasy score"],
  basketball: ["points", "rebounds", "assists", "3-pointers", "threes attempted", "two-pointers made", "two-pointers attempted", "field goals made", "field goals attempted", "free throws made", "free throws attempted", "offensive rebounds", "defensive rebounds", "personal fouls", "points + rebounds + assists", "points + rebounds", "points + assists", "rebounds + assists", "steals", "blocks", "steals + blocks", "turnovers", "double-double", "triple-double", "minutes played", "fantasy score"],
  baseball: ["hits", "total bases", "singles", "doubles", "triples", "extra base hits", "home runs", "rbis", "runs", "hits + runs + rbis", "walks", "strikeouts", "outs recorded", "earned runs allowed", "hits allowed", "walks allowed", "runs allowed", "pitches thrown"],
  hockey: ["goals", "assists", "points", "shots on goal", "saves", "goals against", "blocks", "hits", "faceoffs won", "penalty minutes"],
  tennis: ["aces", "double faults", "games won", "total games", "sets won", "total sets", "breaks", "fantasy score"],
  soccer: ["fantasy score", "goalie fantasy score", "passes attempted", "shots", "shots on target", "goals", "assists", "goal + assist", "tackles", "clearances", "crosses", "saves", "goals allowed", "shots assisted", "fouls"],
};

export function sportGroupOf(league: string): string {
  if (league === "nfl" || league === "ncaaf") return "football";
  if (["nba", "wnba", "ncaam", "ncaaw"].includes(league)) return "basketball";
  if (league === "mlb") return "baseball";
  if (league === "nhl") return "hockey";
  if (league === "atp" || league === "wta") return "tennis";
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

/** Words soccer and tennis read their own way ("Shots", "Fouls"): the older reader decides those. */
const PREFER_REGEX = new Set(["shots on goal", "personal fouls", "goals against", "tackles", "saves", "goals", "assists", "fantasy score"]);

export function propMarketOf(text: string): string {
  // "Rec Yds 2Q", "2nd Quarter Receiving Yards", "1H Points": the stat, then the period it counts in.
  const code = periodOf(text);
  const base = code ? stripPeriod(text) : text;
  const exact = resolveStat(base, { strict: true });
  if (exact && (exact.via === "combo" || (exact.via === "alias" && !PREFER_REGEX.has(exact.label) && !/\bpasses\s+attempted\b/i.test(base)))) return withPeriod(exact.label, code);
  // "Stolen Bases", "First TD Scorer": never read as a nearby stat ("total bases", "touchdowns").
  if (notTrackableReason(base)) return "";
  for (const [re, label] of PROP_MARKETS) if (re.test(base)) return withPeriod(label, code);
  if (exact) return withPeriod(exact.label, code);
  // A bare "TO" right after the line ("Under 2.5 TO") is the stat itself: turnovers.
  if (/\d\s+TOs?\s*(?:[+-]\d{3,4}\s*)?$/i.test(base)) return withPeriod("turnovers", code);
  const inLine = findStatIn(base);
  if (inLine) return withPeriod(inLine.label, code);
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
    // Name, then a jersey/matchup line ("#22 ANA vs SJ"), then the bet: skip the info line, never read its number as the line.
    const info = (l?: string) => !!l && !BET_WORDS.test(l.replace(/#\s?\d+/g, "")) && /#\s?\d|\b(vs\.?|@|at)\b|·/i.test(l);
    if (headIsName && info(next) && lines[i + 2] && BET_WORDS.test(lines[i + 2]) && !/^[A-Za-z][A-Za-z .'-]+\s+(over|under)\b/i.test(lines[i + 2])) {
      out.push(`${head} ${lines[i + 2]}`);
      i += 2;
      continue;
    }
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

/** Pick'em words to plain sides; demon/goblin tags dropped (the printed number is the line). */
export function normalizeSlipText(raw: string): string {
  return raw
    .replace(/[−–—]/g, "-")
    .replace(/[↑⬆▲]/g, " over ")
    .replace(/[↓⬇▼]/g, " under ")
    .replace(/\b(more|higher)\b/gi, "over")
    .replace(/\b(less|lower|fewer)\b/gi, "under")
    .replace(/\b(demon|goblin|taco|discount(?:ed)?|boost(?:ed)?|free\s*pick)\b/gi, " ")
    // "1+ Shots on Goal", "2+ Hits": at least X means over X-0.5.
    .replace(/(^|[\s(])(\d{1,3})\s?\+(?=\s*[A-Za-z]|\s*$)/gm, (_m, pre: string, n: string) => `${pre}over ${Number(n) - 0.5} `)
    .replace(/[ \t]+/g, " ");
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/** First date printed on the slip ("10/14", "10/14/26", "Oct 14", "2026-10-14"), as YYYY-MM-DD. Null when none. */
export function slipDateOf(text: string, today: Date = new Date()): string | null {
  const y0 = today.getFullYear();
  const fmt = (y: number, m: number, d: number) => (m >= 1 && m <= 12 && d >= 1 && d <= 31 ? `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}` : null);
  const iso = text.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
  if (iso) return fmt(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  const md = text.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/);
  if (md) {
    const y = md[3] ? (md[3].length === 2 ? 2000 + Number(md[3]) : Number(md[3])) : y0;
    return fmt(y, Number(md[1]), Number(md[2]));
  }
  const mon = text.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})\b/i);
  if (mon) return fmt(y0, MONTHS.indexOf(mon[1].slice(0, 3).toLowerCase()) + 1, Number(mon[2]));
  return null;
}

const MATCHUP = /^([A-Za-z][A-Za-z .'&-]{1,30}?)\s+(?:vs\.?|v\.?|@|at)\s+([A-Za-z][A-Za-z .'&-]{1,30}?)(?:\s+[-·•|]?\s*(?:mon|tue|wed|thu|fri|sat|sun|today|tomorrow|\d{1,2}[/:]).*)?$/i;
const NAME_LINE = /^[A-Z][A-Za-z.'-]+(?:\s+[A-Z][A-Za-z.'-]+){1,3}$/;
const STAT_LINE = /^(\d{1,3}(?:\.\d)?)\s+([A-Za-z][A-Za-z0-9 +.'-]{1,40})$/;
const SIDE_LINE = /^(over|under)$/i;
const NOT_A_NAME = /\b(play|plays|pick|picks|entry|parlay|flex|power|champions|lineup|slip|payout|insured|standard|boost|promo)\b/i;

/**
 * Pick'em layouts print one player per block: name, matchup line, "24.5 Points", then More/Less.
 * Returns those rows and the lines it used, so the plain parser skips them.
 */
export function pickemRows(lines: string[]): { rows: SlipRow[]; used: Set<number> } {
  const rows: SlipRow[] = [];
  const used = new Set<number>();
  for (let i = 0; i < lines.length; i++) {
    if (!NAME_LINE.test(lines[i]) || BET_WORDS.test(lines[i]) || NOT_A_NAME.test(lines[i])) continue;
    let team: string | null = null;
    let opponent: string | null = null;
    let stat: RegExpMatchArray | null = null;
    let side: string | null = null;
    const take: number[] = [i];
    for (let j = i + 1; j < Math.min(lines.length, i + 6); j++) {
      const l = lines[j];
      // Another name before this block's stat: this line was a header, not a player.
      if (NAME_LINE.test(l) && !MATCHUP.test(l) && !SIDE_LINE.test(l)) break;
      const mu = l.match(MATCHUP);
      if (mu && !team) {
        team = mu[1].trim();
        opponent = mu[2].trim();
        take.push(j);
        continue;
      }
      const st = l.match(STAT_LINE);
      if (st && !stat && propMarketOf(st[2])) {
        stat = st;
        take.push(j);
        continue;
      }
      if (SIDE_LINE.test(l) && !side) {
        side = l.toLowerCase();
        take.push(j);
        if (stat) break;
      }
    }
    if (!stat) continue;
    take.forEach((k) => used.add(k));
    rows.push({
      subject: lines[i],
      kind: "prop",
      market: propMarketOf(stat[2]),
      line: Number(stat[1]),
      selection: side === "over" ? "Over" : side === "under" ? "Under" : null,
      odds: null,
      team,
      opponent,
    });
    i = Math.max(...take);
  }
  return { rows, used };
}

export function parseSlipRows(raw: string): SlipRow[] {
  raw = normalizeSlipText(raw);
  const plain = raw.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  const pe = pickemRows(plain);
  if (pe.rows.length) raw = plain.filter((_, i) => !pe.used.has(i)).join("\n");
  return [...pe.rows, ...parseSlipRowsPlain(raw)];
}

function parseSlipRowsPlain(raw: string): SlipRow[] {
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
    let market = propMarketOf(line);
    const spreadM = line.match(/(?:^|\s)([+-]\d{1,2}(?:\.5)?)(?=\s|$)/);
    const numM = line.match(/(\d+(?:\.\d+)?)/);

    // A stat no box carries ("Over 1.5 Dunks") is still a player prop: keep the slip's words so the leg says why.
    if (!market && sel && numM && !totalWord && notTrackableReason(line)) {
      const after = line.slice((numM.index ?? 0) + numM[0].length).replace(/[+-]\d{3,4}\b/g, " ").replace(/\s+/g, " ").trim();
      market = after || notTrackableReason(line)!.label.toLowerCase();
    }
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


/** How well text names a team (see teamResolve): nickname over city, full name highest. 0 none. */
export function teamScore(text: string, t: { abbr: string; name: string }, league?: string): number {
  return teamScoreLeague(text, t, league);
}

/** Games where `text` names one side. Best score first; ties keep slate order (soonest). */
export function findTeamGames(text: string, games: SlateGame[]): { game: SlateGame; side: "home" | "away"; score: number }[] {
  const out: { game: SlateGame; side: "home" | "away"; score: number }[] = [];
  for (const g of games) {
    const h = teamScore(text, g.home, g.league);
    const a = teamScore(text, g.away, g.league);
    if (h || a) out.push({ game: g, side: h >= a ? "home" : "away", score: Math.max(h, a) });
  }
  return out.sort((p, q) => q.score - p.score);
}

/** Games where both teams are named (for totals). */
export function findBothTeams(text: string, games: SlateGame[]): SlateGame | null {
  return games.find((g) => teamScore(text, g.home, g.league) > 0 && teamScore(text, g.away, g.league) > 0) ?? null;
}

export type FoundPlayer = { id: string; name: string; league: string; teamId: string | null };

export const TENNIS = new Set(["atp", "wta"]);
export const BASKETBALL = new Set(["nba", "wnba", "ncaam", "ncaaw"]);
const TENNIS_MARKETS = new Set(["aces", "double faults", "games won", "total games", "sets won", "total sets", "breaks"]);
const HOOP_ONLY = /rebounds|3-pointers|threes attempted|field goals attempted|personal fouls|points \+|rebounds \+|steals|blocks|free throws|turnovers/;

/** Which sport a row is about, from its league hint and market. Null = can't tell. */
export function rowSport(row: SlipRow): "tennis" | "basketball" | null {
  const lg = (row.league ?? "").toLowerCase();
  if (row.sport === "tennis" || TENNIS.has(lg) || TENNIS_MARKETS.has(propMarketOf(row.market) || row.market)) return "tennis";
  if (BASKETBALL.has(lg) || (row.kind === "prop" && HOOP_ONLY.test(propMarketOf(row.market) || row.market))) return "basketball";
  return null;
}

/** "Jannik Sinner" vs "J. Sinner" / "Sinner" / "Sinner J.". Tennis slips often print short names. */
export function playerNameHit(printed: string, full: string): boolean {
  if (nameClose(printed, full)) return true;
  const p = normName(printed.replace(/\./g, " "));
  const f = normName(full);
  if (!p || !f) return false;
  const pw = p.split(" ");
  const fw = f.split(" ");
  const fl = fw[fw.length - 1];
  if (pw.length === 1) return pw[0].length >= 4 && (pw[0] === fl || fw.slice(1).join(" ") === pw[0]);
  // "J Sinner" or "Sinner J"
  const initial = pw.find((w) => w.length === 1);
  const rest = pw.filter((w) => w.length > 1).join(" ");
  return !!initial && !!rest && fw[0][0] === initial && (rest === fl || rest === fw.slice(1).join(" "));
}

/** A name as printed in a matchup row, which slips cut off ("Giusti…", "Kasnik..."). Prefix of the surname counts. */
export function rowNameHit(printed: string, full: string): boolean {
  const cut = /(\u2026|\.\.\.?)\s*$/.test(printed.trim());
  const clean = printed.trim().replace(/(\u2026|\.\.\.?)\s*$/, "").trim();
  if (!clean) return false;
  if (!cut) return playerNameHit(clean, full);
  const stem = normName(clean.replace(/\./g, " ")).split(" ").pop() ?? "";
  const words = normName(full).split(" ");
  return stem.length >= 4 && words.slice(1).some((w) => w.startsWith(stem));
}

/** The opponent printed beside a leg: "vs Paul" / "@ BOS" / "Giusti…" → the bare name. */
export function cleanOpponent(o: string | null | undefined): string {
  return (o ?? "").replace(/^(vs\.?|v\.?|@|at)\s+/i, "").trim();
}

/** Sports date (US Eastern) of a start time, YYYY-MM-DD. */
export function easternDate(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(t));
}

/**
 * Which of several games a leg means. A printed date wins (same day, then closest). Without one: a game in progress,
 * then the next one within four days, then the most recent final. A leg the slip marks settled looks back first.
 */
export function pickGame<T extends SlateGame>(cands: T[], row: Pick<SlipRow, "date" | "settled">, now = Date.now()): T | null {
  if (!cands.length) return null;
  // A leg the slip marks settled is over: a game that has not started is never it.
  if (row.settled) {
    cands = cands.filter((g) => g.state !== "pre");
    if (!cands.length) return null;
  }
  if (row.date && /^\d{4}-\d{2}-\d{2}$/.test(row.date)) {
    const same = cands.filter((g) => easternDate(g.start) === row.date);
    if (same.length) return same.find((g) => g.state === "in") ?? same[0];
    const at = Date.parse(row.date + "T23:00:00Z");
    return [...cands].sort((a, b) => Math.abs(Date.parse(a.start) - at) - Math.abs(Date.parse(b.start) - at))[0];
  }
  const live = cands.find((g) => g.state === "in");
  if (live) return live;
  const past = cands.filter((g) => g.state === "post").sort((a, b) => Date.parse(b.start) - Date.parse(a.start));
  const next = cands.filter((g) => g.state === "pre").sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
  if (row.settled && past.length) return past[0];
  if (next.length && Date.parse(next[0].start) - now < 4 * 864e5) return next[0];
  // A final from the last day and a half beats a game a week out.
  if (past.length && now - Date.parse(past[0].start) < 1.5 * 864e5) return past[0];
  return next[0] ?? past[0] ?? null;
}

/** Tennis matches where the printed name is one of the two players. */
export function tennisGames(name: string, games: SlateGame[], opponent?: string | null): { game: SlateGame; side: "home" | "away" }[] {
  const out: { game: SlateGame; side: "home" | "away" }[] = [];
  const opp = cleanOpponent(opponent);
  for (const g of games) {
    if (!TENNIS.has(g.league)) continue;
    const side = rowNameHit(name, g.home.name) ? "home" : rowNameHit(name, g.away.name) ? "away" : null;
    if (!side) continue;
    // The opponent printed on the slip must be the other player: same name, another match is a different leg.
    if (opp && !rowNameHit(opp, side === "home" ? g.away.name : g.home.name)) continue;
    out.push({ game: g, side });
  }
  return out;
}

/** "D. Medvedev", "Z. Piros": an initial and a surname reads as one person (tennis, MMA), not a team. */
export const personName = (s: string) => /^[A-Z]\.\s?[A-Z][\p{L}'’-]+(\s[A-Z][\p{L}'’-]+)?$/u.test(s.trim());
const INDIVIDUAL = new Set(["atp", "wta", "ufc", "pfl", "boxing"]);

const gameRef = (g: SlateGame): GameRef => ({ league: g.league, id: g.id, away: g.away.abbr, home: g.home.abbr, start: g.start, state: g.state, awayName: g.away.name, homeName: g.home.name });

/** Games you could tie an unmatched row to: same league or sport, closest to the printed date or now. */
export function gameOptions(row: SlipRow, games: SlateGame[], now = Date.now(), max = 12): GameRef[] {
  const sport = rowSport(row);
  const lg = (row.league ?? "").toLowerCase();
  let pool = games.filter((g) => (lg ? g.league === lg : sport === "tennis" ? TENNIS.has(g.league) : sport === "basketball" ? BASKETBALL.has(g.league) : true));
  if (!pool.length) pool = games;
  const text = [row.team, row.opponent, row.kind === "prop" ? "" : row.subject].filter(Boolean).join(" ");
  const named = text ? pool.filter((g) => teamScore(text, g.home, g.league) > 0 || teamScore(text, g.away, g.league) > 0 || playerNameHit(text, g.home.name) || playerNameHit(text, g.away.name)) : [];
  const at = row.date ? Date.parse(row.date + "T23:00:00Z") : now;
  return (named.length ? named : pool)
    .slice()
    .sort((a, b) => Math.abs(Date.parse(a.start) - at) - Math.abs(Date.parse(b.start) - at))
    .slice(0, max)
    .map(gameRef);
}

/** Narrow to the printed league when it has any game at all. */
function byLeague(row: SlipRow, games: SlateGame[]): SlateGame[] {
  const lg = (row.league ?? "").toLowerCase();
  if (!lg) return games;
  const only = games.filter((g) => g.league === lg);
  return only.length || row.leagueLocked ? only : games;
}

/**
 * Same-name teams across leagues (Kings, Giants, Rangers, "LA"): narrow by what the slip says around the name,
 * strongest first: the stat or market, the spread size, the printed date, the slip's other legs. A hint that
 * fits none of the candidates is skipped, so a team with a game in the window is never dropped for one without. Pure.
 */
export function narrowByContext<T extends { game: SlateGame }>(hits: T[], row: SlipRow): T[] {
  const leagues = (xs: T[]) => new Set(xs.map((h) => h.game.league));
  if (leagues(hits).size < 2) return hits;
  const hints: (string[] | null)[] = [
    leaguesForMarket(row.kind === "prop" || row.kind === "total" ? row.market : ""),
    row.kind === "spread" ? leaguesForSpread(row.line) : null,
    row.date ? [...leagues(hits.filter((h) => easternDate(h.game.start) === row.date))] : null,
    row.slipLeagues?.length ? mostCommon(row.slipLeagues) : null,
  ];
  let out = hits;
  for (const hint of hints) {
    if (!hint?.length || leagues(out).size < 2) continue;
    const sub = out.filter((h) => hint.includes(h.game.league));
    if (sub.length) out = sub;
  }
  return out;
}

const mostCommon = (xs: string[]): string[] => {
  const n = new Map<string, number>();
  for (const x of xs) n.set(x, (n.get(x) ?? 0) + 1);
  const top = Math.max(...n.values());
  return [...n].filter(([, c]) => c === top).map(([k]) => k);
};

const LEAGUE_NAME: Record<string, string> = { nfl: "NFL", ncaaf: "NCAAF", nba: "NBA", wnba: "WNBA", ncaam: "NCAAM", ncaaw: "NCAAW", mlb: "MLB", nhl: "NHL", mls: "MLS", epl: "EPL" };
const leagueList = (xs: string[]) => [...new Set(xs)].map((x) => LEAGUE_NAME[x] ?? x.toUpperCase()).join(" or ");

/** Ties one row to a game and a leg. `player` is the ESPN search or roster hit for prop rows (or null). */
/** "Winner", "To Win", "Match Winner", "Moneyline", "ML": a pick to win, not a stat. */
export const isWinnerMarket = (m: string) => /^\s*(match\s+|fight\s+)?(winner|to\s+win|moneyline|money\s*line|ml)\s*$/i.test(m);

export function matchRow(row: SlipRow, games: SlateGame[], player: FoundPlayer | null, now = Date.now()): ImportLeg {
  if (row.kind === "prop" && isWinnerMarket(row.market)) row = { ...row, kind: "moneyline", market: "moneyline", line: null, selection: null };
  const odds = row.odds;
  const pool = byLeague(row, games);
  const sport = rowSport(row);
  if (row.kind === "prop") {
    const known = propMarketOf(row.market);
    if (known) row = { ...row, market: known, period: periodOf(known) };
    // Tennis: the players are the two sides of the match.
    const tennisAll = sport === "tennis" || (!player && row.league == null) ? tennisGames(row.subject, games) : [];
    const tennisVs = row.opponent ? tennisGames(row.subject, games, row.opponent) : [];
    const tennis = tennisVs.length ? tennisVs : tennisAll;
    if (tennis.length) {
      const g = pickGame(tennis.map((t) => t.game), row, now);
      if (!g) return { row, leg: null, game: null, manual: true, issue: "The slip says this is settled, but no finished game fits. Match it below, or save it as a manual leg.", options: gameOptions(row, games, now) };
      const side = tennis.find((t) => t.game === g)?.side ?? "home";
      const who = side === "home" ? g.home : g.away;
      const leg: LegInput = { league: g.league, gameId: g.id, kind: "prop", athleteId: who.id, athleteName: who.name, market: row.market, line: row.line, pick: row.selection === "Under" ? "under" : "over", odds };
      const issue = !row.market ? "Pick the stat." : row.line == null ? "Add the line." : !row.selection ? "Pick over or under." : null;
      return { row, leg, game: gameRef(g), issue, manual: true };
    }
    if (!player) return { row, leg: null, game: null, manual: true, issue: "Player not found in games from the last two weeks or the next two. Match it below, or save it as a manual leg.", options: gameOptions(row, games, now) };
    // Team ids repeat across leagues (WNBA 5 is not MLB 5): same league only. Soccer search hits say "soccer".
    const soccer = (lg: string) => !TENNIS.has(lg) && !BASKETBALL.has(lg) && !["nfl", "ncaaf", "mlb", "nhl", "ufc"].includes(lg);
    const sameLeague = (x: SlateGame) => x.league === player.league || (player.league === "soccer" && soccer(x.league));
    const cands = games.filter((x) => sameLeague(x) && player.teamId && (x.home.id === player.teamId || x.away.id === player.teamId));
    const g = pickGame(cands, row, now);
    if (!g) return { row, leg: null, game: null, manual: true, issue: `${player.name}’s team has no game in the window. Match it below, or save it as a manual leg.`, options: gameOptions({ ...row, league: row.league ?? player.league }, games, now) };
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
    const tracked = row.market && liveTrackable(row.market, g.league);
    const issue = !row.market
      ? "Pick the stat. Until then it saves as a manual leg."
      : row.line == null
        ? "Add the line."
        : !row.selection
          ? "Pick over or under."
          : !tracked
            ? notTrackableReason(row.market, g.league)
              ? `${notTrackableReason(row.market, g.league)!.label} can’t be followed live: ${notTrackableReason(row.market, g.league)!.reason}. You’ll grade this leg yourself.`
              : periodOf(row.market)
              ? "We can’t follow this stat for one period in this sport yet, so you’ll grade this leg yourself."
              : "We can’t follow this stat live yet, so you’ll grade this leg yourself."
            : null;
    return { row, leg: { ...leg, athleteName: player.name }, game: gameRef(g), issue, manual: !tracked };
  }
  if (row.kind === "total") {
    const text = [row.subject, row.team, row.opponent].filter(Boolean).join(" @ ");
    const bothAll = pool.filter((g) => (teamScore(text, g.home, g.league) > 0 && teamScore(text, g.away, g.league) > 0) || (TENNIS.has(g.league) && playerNameHit(row.team ?? row.subject, g.home.name) && playerNameHit(row.opponent ?? "", g.away.name)));
    const twoNamed = /\s(@|vs\.?|v\.?|at)\s/i.test(row.subject) || !!(row.team && row.opponent);
    const one = twoNamed ? [] : findTeamGames(text, pool);
    const wrap = (xs: SlateGame[]) => narrowByContext(xs.map((game) => ({ game })), row).map((h) => h.game);
    const g = pickGame(wrap(bothAll.length ? bothAll : one.filter((h) => h.score === one[0]?.score).map((h) => h.game)), row, now);
    if (!g) return { row, leg: null, game: null, issue: twoNamed ? "That matchup is not in games from the last two weeks or the next two. Match it below." : "Which game? Match it below.", options: gameOptions(row, games, now) };
    return {
      row,
      leg: { league: g.league, gameId: g.id, kind: "total", pick: row.selection === "Under" ? "under" : "over", line: row.line, odds },
      game: gameRef(g),
      issue: row.line == null ? "Add the line." : !row.selection ? "Pick over or under." : !bothAll.length ? "Only one team named. Check the game." : null,
    };
  }
  // Spread or moneyline. Tennis: a player to win, against the opponent printed on the slip.
  const opp = cleanOpponent(row.opponent);
  // Tennis for sure (read as tennis, or a tennis league); or maybe (a person and an opponent, sport not read).
  const tennisLike = sport === "tennis";
  const maybeTennis = !tennisLike && !row.sport && personName(row.subject) && !!opp && !row.league;
  const tennis = row.sport === "mma" ? [] : tennisLike || maybeTennis || !findTeamGames(row.subject, pool).length ? tennisGames(row.subject, games, opp || null) : [];
  if (!tennis.length && tennisLike) {
    // Never borrow another match (a future one, another opponent) or another sport for a tennis leg.
    const named = tennisGames(row.subject, games).length > 0;
    const issue = opp
      ? `ESPN doesn't cover this event (${row.subject} vs ${opp}). It saves as a manual leg you grade.`
      : named
        ? "No finished match fits. Add the opponent, or match it below."
        : "Player not found in ESPN tennis from the last two weeks or the next two. It saves as a manual leg you grade.";
    return { row: { ...row, sport: "tennis" }, leg: null, game: null, manual: true, issue, options: gameOptions({ ...row, sport: "tennis" }, games, now) };
  }
  if (tennis.length) {
    const g = pickGame(tennis.map((t) => t.game), row, now);
    if (!g) return { row, leg: null, game: null, manual: true, issue: "The slip says this is settled, but no finished game fits. Match it below, or save it as a manual leg.", options: gameOptions(row, games, now) };
    const side = tennis.find((t) => t.game === g)?.side ?? "home";
    const who = side === "home" ? g.home : g.away;
    const leg: LegInput =
      row.kind === "spread"
        ? { league: g.league, gameId: g.id, kind: "spread", side, team: who.name, line: row.line, odds }
        : { league: g.league, gameId: g.id, kind: "moneyline", side, team: who.name, odds };
    return { row, leg, game: gameRef(g), issue: null, manual: row.kind === "spread" };
  }
  // Fighters and players: when the slip prints the opponent, the other side has to be them.
  // A person ("M. Kasnikowski") only matches a fighter or player by name, never by a stray word; a team needs more than a city word.
  const person = personName(row.subject);
  const hits = findTeamGames(row.subject, pool).filter((h) => {
    const me = h.side === "home" ? h.game.home : h.game.away;
    const them = h.side === "home" ? h.game.away : h.game.home;
    if (INDIVIDUAL.has(h.game.league)) {
      if (!rowNameHit(row.subject, me.name)) return false;
      return !opp || rowNameHit(opp, them.name) || teamScore(opp, them, h.game.league) >= 2;
    }
    return !person || h.score >= 2;
  });
  if (!hits.length && maybeTennis)
    return { row, leg: null, game: null, manual: true, issue: `ESPN doesn't cover this event (${row.subject} vs ${opp}). It saves as a manual leg you grade.`, options: gameOptions(row, games, now) };
  if (!hits.length) return { row, leg: null, game: null, issue: "Team not found in games from the last two weeks or the next two. Match it below.", options: gameOptions(row, games, now) };
  const top = hits.filter((h) => h.score === hits[0].score);
  // The opponent, when printed, settles which game; then the stat, spread size, date and other legs pick the league.
  const vs = row.opponent ? top.filter((h) => teamScore(row.opponent as string, h.side === "home" ? h.game.away : h.game.home, h.game.league) > 0) : [];
  const fits = narrowByContext(vs.length ? vs : top, row);
  const leagueSet = [...new Set(fits.map((h) => h.game.league))];
  const g = pickGame(fits.map((h) => h.game), row, now);
  if (!g) return { row, leg: null, game: null, manual: true, issue: "The slip says this is settled, but no finished game fits. Match it below, or save it as a manual leg.", options: gameOptions(row, games, now) };
  const best = fits.find((h) => h.game === g) ?? fits[0];
  const sameDay = fits.filter((h) => h.game.id !== g.id && easternDate(h.game.start) === easternDate(g.start));
  const unsure = sameDay.length > 0;
  const otherLeagues = leagueSet.length > 1 ? `Could be ${leagueList(leagueSet)}. Tap the league to change it.` : null;
  const t = best.side === "home" ? best.game.home : best.game.away;
  const leg: LegInput =
    row.kind === "spread"
      ? { league: best.game.league, gameId: best.game.id, kind: "spread", side: best.side, team: t.abbr, line: row.line, odds }
      : { league: best.game.league, gameId: best.game.id, kind: "moneyline", side: best.side, team: t.abbr, odds };
  return { row, leg, game: gameRef(best.game), issue: otherLeagues ?? (unsure ? "More than one game fits. Check the team." : null) };
}

/**
 * Grade a finished tennis leg from the set scores. Winner, total games, games won, sets won, total sets.
 * Aces, double faults and breaks need match stats ESPN does not post on the scoreboard: null (you grade it).
 */
export function gradeTennis(leg: LegInput, g: SlateGame): "win" | "loss" | "push" | null {
  if (g.state !== "post" || !g.sets) return null;
  const games = (xs: string[]) => xs.map((x) => parseInt(x, 10)).filter((n) => Number.isFinite(n));
  const a = games(g.sets.away);
  const h = games(g.sets.home);
  if (!a.length || a.length !== h.length) return null;
  const setsA = a.filter((v, i) => v > h[i]).length;
  const setsH = h.filter((v, i) => v > a[i]).length;
  const winner = g.winner ?? (setsA > setsH ? "away" : setsH > setsA ? "home" : null);
  if (leg.kind === "moneyline") return winner ? (winner === leg.side ? "win" : "loss") : null;
  const cmp = (v: number, line: number) => (v > line ? "win" : v < line ? "loss" : "push");
  const flip = (r: "win" | "loss" | "push") => (leg.pick === "under" ? (r === "win" ? "loss" : r === "loss" ? "win" : "push") : r);
  if (leg.kind === "total" && leg.line != null) return flip(cmp(a.reduce((x, y) => x + y, 0) + h.reduce((x, y) => x + y, 0), leg.line));
  if (leg.kind !== "prop" || leg.line == null) return null;
  const side = leg.athleteId === g.home.id ? "home" : leg.athleteId === g.away.id ? "away" : null;
  const m = propMarketOf(leg.market ?? "") || leg.market;
  const mine = side === "home" ? h : side === "away" ? a : null;
  const total = a.reduce((x, y) => x + y, 0) + h.reduce((x, y) => x + y, 0);
  if (m === "total games") return flip(cmp(total, leg.line));
  if (m === "total sets") return flip(cmp(a.length, leg.line));
  if (!mine || !side) return null;
  if (m === "games won") return flip(cmp(mine.reduce((x, y) => x + y, 0), leg.line));
  if (m === "sets won") return flip(cmp(side === "home" ? setsH : setsA, leg.line));
  return null;
}

/** Pulls whole leg objects out of JSON that was cut off mid-way (a long slip can hit the token cap). */
export function salvageJson(content: string): Record<string, unknown> | null {
  const raw = content.replace(/^```(?:json)?|```$/g, "").trim();
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    /* fall through */
  }
  const at = raw.indexOf('"legs"');
  if (at < 0) return null;
  const open = raw.indexOf("[", at);
  if (open < 0) return null;
  const legs: unknown[] = [];
  let depth = 0;
  let from = -1;
  let inStr = false;
  for (let i = open + 1; i < raw.length; i++) {
    const ch = raw[i];
    if (inStr) {
      if (ch === "\\") i++;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === "{") {
      if (depth === 0) from = i;
      depth++;
    } else if (ch === "}") {
      depth--;
      if (depth === 0 && from >= 0) {
        try {
          legs.push(JSON.parse(raw.slice(from, i + 1)));
        } catch {
          /* skip a broken leg */
        }
        from = -1;
      }
    } else if (ch === "]" && depth === 0) break;
  }
  const book = /"book"\s*:\s*"([^"]{1,30})"/.exec(raw)?.[1] ?? null;
  return legs.length ? { legs, book, lines: [] } : null;
}

/** Well-known nicknames and initials on slips → the name ESPN uses. Only names a slip would print. */
const NICKNAMES: Record<string, string> = {
  sga: "Shai Gilgeous-Alexander", kd: "Kevin Durant", lbj: "LeBron James", "king james": "LeBron James", ad: "Anthony Davis", "the greek freak": "Giannis Antetokounmpo",
  "greek freak": "Giannis Antetokounmpo", giannis: "Giannis Antetokounmpo", steph: "Stephen Curry", "steph curry": "Stephen Curry", cp3: "Chris Paul", joker: "Nikola Jokic",
  jokic: "Nikola Jokic", ant: "Anthony Edwards", "ant-man": "Anthony Edwards", "ant edwards": "Anthony Edwards", jjj: "Jaren Jackson Jr.", pg13: "Paul George", pg: "Paul George",
  dame: "Damian Lillard", wemby: "Victor Wembanyama", luka: "Luka Doncic", "luka dončić": "Luka Doncic", "the beard": "James Harden", trae: "Trae Young", ja: "Ja Morant",
  zion: "Zion Williamson", spida: "Donovan Mitchell", book: "Devin Booker", "a'ja": "A'ja Wilson", aja: "A'ja Wilson", cmc: "Christian McCaffrey", "arsb": "Amon-Ra St. Brown",
  "amon-ra": "Amon-Ra St. Brown", jsn: "Jaxon Smith-Njigba", "jaxon smith njigba": "Jaxon Smith-Njigba", bijan: "Bijan Robinson", saquon: "Saquon Barkley",
  "king henry": "Derrick Henry", mahomes: "Patrick Mahomes", "j. jefferson": "Justin Jefferson", jj: "Justin Jefferson", ohtani: "Shohei Ohtani",
  "sho": "Shohei Ohtani", judge: "Aaron Judge", mcdavid: "Connor McDavid", "mcjesus": "Connor McDavid", ovi: "Alex Ovechkin", "auston": "Auston Matthews",
  "nikola jokić": "Nikola Jokic",
};
/** The name to search for: a nickname spelled out, else the slip's own text. */
export function expandNickname(subject: string): string {
  const k = subject.toLowerCase().replace(/\s+/g, " ").trim();
  return NICKNAMES[k] ?? NICKNAMES[k.replace(/\./g, "")] ?? subject;
}

const abbrEq = (a: string, b: string) => {
  const x = a.toUpperCase().replace(/[^A-Z&]/g, "");
  const y = b.toUpperCase().replace(/[^A-Z&]/g, "");
  return !!x && !!y && (x === y || (x.length >= 2 && y.length >= 2 && (x.startsWith(y) || y.startsWith(x)) && Math.abs(x.length - y.length) <= 1));
};
const teamHit = (t: string, side: SlateGame["home"], league?: string) => abbrEq(t, side.abbr) || (t.length > 3 && (side.name ?? "").toLowerCase().includes(t.toLowerCase())) || teamScoreLeague(t, side, league) >= 3;

/**
 * The league a row belongs to from the matchup printed beside it ("PHI vs BOS"): the leagues of window games
 * with both teams. Null when nothing printed, or the pair fits more than one league. Pure.
 */
export function leagueFromTeams(row: SlipRow, games: SlateGame[]): string | null {
  if (row.league || !row.team || !row.opponent) return null;
  const t = row.team.replace(/^(vs\.?|@)\s*/i, "").trim();
  const o = row.opponent.replace(/^(vs\.?|@)\s*/i, "").trim();
  const both = games.filter((g) => (teamHit(t, g.home, g.league) && teamHit(o, g.away, g.league)) || (teamHit(t, g.away, g.league) && teamHit(o, g.home, g.league)));
  const one = (xs: SlateGame[]) => {
    const l = new Set(xs.map((g) => g.league));
    return l.size === 1 ? [...l][0] : null;
  };
  // Same matchup in two leagues (PHI vs BOS): the printed date picks one.
  return one(both) ?? (row.date ? one(both.filter((g) => easternDate(g.start) === row.date)) : null);
}

/** What to say about the slip's own mark. ESPN's final always wins; the mark only fills a gap ESPN leaves. Pure. */
export function markNote(result: "win" | "loss" | "push" | null, mark: "win" | "loss" | "push" | null, noGame: boolean): string | null {
  if (!mark) return null;
  const said = mark === "win" ? "a win" : mark === "loss" ? "a loss" : "a push";
  if (result && result !== mark) return `The slip shows ${said}; ESPN's final says ${result}. ESPN's result is used.`;
  if (!result && noGame) return `The slip shows ${said}: set it in your Log.`;
  return null;
}
