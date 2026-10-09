/**
 * Slip import: rows read from a photo, link, or pasted text, matched to real games.
 * Pure. Nothing here invents a leg: a row only exists if its text was on the slip,
 * and anything we cannot tie to a game stays flagged for you to fix.
 */

import { statFromMarket, type LegInput } from "@/lib/breakdown";

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
  /** Why it is flagged, in plain words. Null when it is ready. */
  issue: string | null;
};

const PROP_MARKETS: [RegExp, string][] = [
  [/pts\s*\+\s*reb\s*\+\s*ast|points\s*\+\s*rebounds\s*\+\s*assists|\bpra\b/i, "points + rebounds + assists"],
  [/pass(?:ing)?(?:\s+|-)?(?:td|touchdown)s?/i, "passing touchdowns"],
  [/pass(?:ing)?(?:\s+|-)?y(?:ar)?ds?/i, "passing yards"],
  [/rush(?:ing)?(?:\s*\+\s*rec(?:eiving)?)?(?:\s+|-)?y(?:ar)?ds?/i, "rushing yards"],
  [/rec(?:eiving)?(?:\s+|-)?y(?:ar)?ds?/i, "receiving yards"],
  [/completions?\b/i, "completions"],
  [/receptions?\b/i, "receptions"],
  [/3[- ]?(?:pointers?|pt|pts|pm)\b|threes?\b/i, "3-pointers"],
  [/rebounds?\b|\breb\b/i, "rebounds"],
  [/assists?\b|\bast\b/i, "assists"],
  [/steals?\b/i, "steals"],
  [/blocks?\b/i, "blocks"],
  [/strike\s*outs?|\bks?\b(?=.*\d)/i, "strikeouts"],
  [/total bases|\bbases\b/i, "total bases"],
  [/home runs?|\bhr\b/i, "home runs"],
  [/\bhits?\b/i, "hits"],
  [/\brbis?\b/i, "rbis"],
  [/shots? on goal|\bsog\b/i, "shots on goal"],
  [/\bsaves?\b/i, "saves"],
  [/\bgoals?\b/i, "goals"],
  [/\bpoints?\b|\bpts\b/i, "points"],
];

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
    if (!player) return { row, leg: null, game: null, issue: "Player not found in today’s or upcoming games. Check the name." };
    const g = pool.find((x) => x.league === player.league && player.teamId && (x.home.id === player.teamId || x.away.id === player.teamId));
    if (!g) return { row, leg: null, game: null, issue: `${player.name}’s team has no game in the next few days.` };
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
    const issue = !stat ? "Pick the stat: we could not read the market." : row.line == null ? "Add the line." : !row.selection ? "Pick over or under." : null;
    return { row, leg, game: gameRef(g), issue };
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
