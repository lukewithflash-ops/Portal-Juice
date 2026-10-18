/**
 * Team-name regression cases for the slip reader (t176: "LA Rams" read as the LA Kings).
 * Teams use ESPN's own names and abbreviations ("LA" Kings, "NY" Knicks, "LA Clippers", "GS"); the games are a
 * synthetic week, mid-October 2026, with every league that shares a city or a nickname on the board.
 */
import type { SlateGame, SlipRow } from "../../src/lib/slipImport";

export const NOW = Date.parse("2026-10-18T20:00:00Z");
type T = [abbr: string, name: string];
let n = 0;
const g = (league: string, day: string, away: T, home: T, state: SlateGame["state"] = "pre"): SlateGame => ({
  league,
  id: `${league}-${++n}`,
  start: `${day}T23:00Z`,
  state,
  away: { id: `${league}:${away[0]}`, abbr: away[0], name: away[1] },
  home: { id: `${league}:${home[0]}`, abbr: home[0], name: home[1] },
});

export const GAMES: SlateGame[] = [
  // NFL, Sun Oct 18 and Thu Oct 22
  g("nfl", "2026-10-18", ["ARI", "Arizona Cardinals"], ["LAR", "Los Angeles Rams"], "in"),
  g("nfl", "2026-10-18", ["LAC", "Los Angeles Chargers"], ["KC", "Kansas City Chiefs"], "in"),
  g("nfl", "2026-10-18", ["NYG", "New York Giants"], ["PHI", "Philadelphia Eagles"], "in"),
  g("nfl", "2026-10-18", ["NYJ", "New York Jets"], ["NE", "New England Patriots"], "in"),
  g("nfl", "2026-10-18", ["CHI", "Chicago Bears"], ["GB", "Green Bay Packers"], "in"),
  g("nfl", "2026-10-18", ["SF", "San Francisco 49ers"], ["TB", "Tampa Bay Buccaneers"], "in"),
  g("nfl", "2026-10-18", ["CAR", "Carolina Panthers"], ["WSH", "Washington Commanders"], "in"),
  // NBA, opening week Oct 20-22
  g("nba", "2026-10-20", ["GS", "Golden State Warriors"], ["LAL", "Los Angeles Lakers"]),
  g("nba", "2026-10-21", ["SAC", "Sacramento Kings"], ["LAC", "LA Clippers"]),
  g("nba", "2026-10-20", ["BOS", "Boston Celtics"], ["NY", "New York Knicks"]),
  g("nba", "2026-10-21", ["CHI", "Chicago Bulls"], ["BKN", "Brooklyn Nets"]),
  g("nba", "2026-10-22", ["SA", "San Antonio Spurs"], ["PHI", "Philadelphia 76ers"]),
  g("nba", "2026-10-22", ["DAL", "Dallas Mavericks"], ["CLE", "Cleveland Cavaliers"]),
  // NHL
  g("nhl", "2026-10-19", ["LA", "Los Angeles Kings"], ["WSH", "Washington Capitals"]),
  g("nhl", "2026-10-19", ["NYR", "New York Rangers"], ["BOS", "Boston Bruins"]),
  g("nhl", "2026-10-20", ["NYI", "New York Islanders"], ["CHI", "Chicago Blackhawks"]),
  g("nhl", "2026-10-20", ["WPG", "Winnipeg Jets"], ["FLA", "Florida Panthers"]),
  g("nhl", "2026-10-21", ["MTL", "Montreal Canadiens"], ["TOR", "Toronto Maple Leafs"]),
  g("nhl", "2026-10-21", ["TB", "Tampa Bay Lightning"], ["PIT", "Pittsburgh Penguins"]),
  g("nhl", "2026-10-22", ["ANA", "Anaheim Ducks"], ["VGK", "Vegas Golden Knights"]),
  // MLB postseason
  g("mlb", "2026-10-19", ["NYM", "New York Mets"], ["LAD", "Los Angeles Dodgers"]),
  g("mlb", "2026-10-19", ["NYY", "New York Yankees"], ["TEX", "Texas Rangers"]),
  g("mlb", "2026-10-20", ["CHC", "Chicago Cubs"], ["STL", "St. Louis Cardinals"]),
  g("mlb", "2026-10-20", ["CHW", "Chicago White Sox"], ["SF", "San Francisco Giants"]),
  // MLS and EPL
  g("mls", "2026-10-18", ["LA", "LA Galaxy"], ["LAFC", "LAFC"], "post"),
  g("mls", "2026-10-18", ["NY", "New York Red Bulls"], ["CHI", "Chicago Fire FC"], "post"),
  g("epl", "2026-10-18", ["MAN", "Manchester United"], ["MNC", "Manchester City"], "post"),
  g("epl", "2026-10-18", ["TOT", "Tottenham Hotspur"], ["ARS", "Arsenal"], "post"),
];

const row = (subject: string, o: Partial<SlipRow> = {}): SlipRow => ({ subject, kind: "moneyline", market: "moneyline", line: null, selection: null, odds: -110, league: null, date: null, ...o });
const sp = (subject: string, line: number, o: Partial<SlipRow> = {}) => row(subject, { kind: "spread", market: "spread", line, ...o });

/** [what the slip says, row, expected league, expected team abbr]. */
export const TEAM_CASES: [string, SlipRow, string, string][] = [
  // The bug: city shorthand + nickname. The nickname wins, the "LA" abbreviation never does on its own.
  ["LA Rams moneyline", row("LA Rams"), "nfl", "LAR"],
  ["LA Rams spread", sp("LA Rams", -3.5), "nfl", "LAR"],
  ["Los Angeles Rams", row("Los Angeles Rams"), "nfl", "LAR"],
  ["LAR", row("LAR"), "nfl", "LAR"],
  ["Rams", row("Rams"), "nfl", "LAR"],
  ["L.A. Rams", row("L.A. Rams"), "nfl", "LAR"],
  ["LA Kings", row("LA Kings"), "nhl", "LA"],
  ["LAK", row("LAK"), "nhl", "LA"],
  ["Los Angeles Kings puck line", sp("Los Angeles Kings", -1.5), "nhl", "LA"],
  ["Kings on a puck line", sp("Kings", -1.5), "nhl", "LA"],
  ["Kings in an NBA parlay", row("Kings", { slipLeagues: ["nba", "nba"] }), "nba", "SAC"],
  ["Sacramento Kings", row("Sacramento Kings"), "nba", "SAC"],
  ["LA Lakers", row("LA Lakers"), "nba", "LAL"],
  ["LAL", row("LAL"), "nba", "LAL"],
  ["LA Clippers", row("LA Clippers"), "nba", "LAC"],
  ["Los Angeles Clippers", row("Los Angeles Clippers"), "nba", "LAC"],
  ["LAC on the Clippers' date", sp("LAC", -6.5, { date: "2026-10-21" }), "nba", "LAC"],
  ["LA Chargers", row("LA Chargers"), "nfl", "LAC"],
  ["Chargers", sp("Chargers", 2.5), "nfl", "LAC"],
  ["LAFC", row("LAFC"), "mls", "LAFC"],
  ["LA Galaxy", row("LA Galaxy"), "mls", "LA"],
  ["LAD", row("LAD"), "mlb", "LAD"],
  ["Dodgers run line", sp("Dodgers", -1.5), "mlb", "LAD"],
  ["LA alone, football spread", sp("LA", -3.5), "nfl", "LAR"],
  // New York
  ["NY Giants", row("NY Giants"), "nfl", "NYG"],
  ["Giants, football spread", sp("Giants", 3.5), "nfl", "NYG"],
  ["SF Giants", row("SF Giants"), "mlb", "SF"],
  ["Niners", row("Niners"), "nfl", "SF"],
  ["NY Jets", row("NY Jets"), "nfl", "NYJ"],
  ["Jets puck line", sp("Jets", -1.5), "nhl", "WPG"],
  ["NY Rangers", row("NY Rangers"), "nhl", "NYR"],
  ["NYR", row("NYR"), "nhl", "NYR"],
  ["Rangers in a baseball parlay", row("Rangers", { slipLeagues: ["mlb"] }), "mlb", "TEX"],
  ["Knicks", row("Knicks"), "nba", "NY"],
  ["NYK", row("NYK"), "nba", "NY"],
  ["Yanks", row("Yanks"), "mlb", "NYY"],
  ["NY Mets", row("NY Mets"), "mlb", "NYM"],
  ["Isles", row("Isles"), "nhl", "NYI"],
  ["NY Red Bulls", row("NY Red Bulls"), "mls", "NY"],
  ["Brooklyn", row("Brooklyn"), "nba", "BKN"],
  // Chicago
  ["Chicago in a football parlay", row("Chicago", { slipLeagues: ["nfl", "nfl", "nba"] }), "nfl", "CHI"],
  ["Chicago Bulls", row("Chicago Bulls"), "nba", "CHI"],
  ["Blackhawks", row("Blackhawks"), "nhl", "CHI"],
  ["Chi Sox", row("Chi Sox"), "mlb", "CHW"],
  ["Cubs", row("Cubs"), "mlb", "CHC"],
  ["Chicago Fire", row("Chicago Fire"), "mls", "CHI"],
  // Boston and same-nickname pairs
  ["Boston in a hockey parlay", row("Boston", { slipLeagues: ["nhl", "nhl"] }), "nhl", "BOS"],
  ["Celtics", row("Celtics"), "nba", "BOS"],
  ["Bruins", row("Bruins"), "nhl", "BOS"],
  ["Panthers puck line", sp("Panthers", -1.5), "nhl", "FLA"],
  ["Panthers football spread", sp("Panthers", 3.5), "nfl", "CAR"],
  ["Cardinals in a baseball parlay", row("Cardinals", { slipLeagues: ["mlb"] }), "mlb", "STL"],
  ["Arizona Cardinals", row("Arizona Cardinals"), "nfl", "ARI"],
  ["Spurs in an EPL parlay", row("Spurs", { slipLeagues: ["epl"] }), "epl", "TOT"],
  ["Spurs basketball spread", sp("Spurs", -5.5), "nba", "SA"],
  ["Man Utd", row("Man Utd"), "epl", "MAN"],
  ["Man City", row("Man City"), "epl", "MNC"],
  // Nicknames
  ["Bucs", row("Bucs"), "nfl", "TB"],
  ["Bolts", row("Bolts"), "nhl", "TB"],
  ["Habs", row("Habs"), "nhl", "MTL"],
  ["Leafs", row("Leafs"), "nhl", "TOR"],
  ["Sixers", row("Sixers"), "nba", "PHI"],
  ["Philly Eagles", row("Philly Eagles"), "nfl", "PHI"],
  ["Pats", row("Pats"), "nfl", "NE"],
  ["Mavs", row("Mavs"), "nba", "DAL"],
  ["Cavs", row("Cavs"), "nba", "CLE"],
  ["Dubs", row("Dubs"), "nba", "GS"],
  ["GSW", row("GSW"), "nba", "GS"],
  ["Caps", row("Caps"), "nhl", "WSH"],
  ["Pens", row("Pens"), "nhl", "PIT"],
  ["Vegas Golden Knights", row("Vegas Golden Knights"), "nhl", "VGK"],
  ["Commanders", row("Commanders"), "nfl", "WSH"],
  // Leagues you chose win over the name
  ["Kings, NBA picked by you", row("Kings", { league: "nba", leagueLocked: true }), "nba", "SAC"],
  ["LA, NHL picked by you", row("LA", { league: "nhl", leagueLocked: true }), "nhl", "LA"],
  // Totals with both teams
  ["Rams @ Cardinals total", row("LA Rams @ Arizona Cardinals", { kind: "total", market: "total", line: 47.5, selection: "Over" }), "nfl", "LAR"],
  ["Kings vs Capitals total", row("LA Kings vs Capitals", { kind: "total", market: "total", line: 5.5, selection: "Under" }), "nhl", "LA"],
];

/** Kings with an NBA hint but no Sacramento game in the window: the team that plays wins. */
export const NO_GAME_CASE = { row: row("Kings", { slipLeagues: ["nba"] }), games: GAMES.filter((x) => x.home.abbr !== "SAC" && x.away.abbr !== "SAC"), league: "nhl", abbr: "LA" };

/** Player props with no team printed: the player's own team and league decide. */
export const PROP_CASES: [string, SlipRow, { id: string; name: string; league: string; teamId: string }, string, string][] = [
  ["Stafford passing yards", row("Matthew Stafford", { kind: "prop", market: "passing yards", line: 249.5, selection: "Over" }), { id: "12483", name: "Matthew Stafford", league: "nfl", teamId: "nfl:LAR" }, "nfl", "LAR"],
  ["Kopitar shots on goal", row("Anze Kopitar", { kind: "prop", market: "shots on goal", line: 2.5, selection: "Over" }), { id: "3380", name: "Anze Kopitar", league: "nhl", teamId: "nhl:LA" }, "nhl", "LA"],
  ["LeBron rebounds", row("LeBron James", { kind: "prop", market: "rebounds", line: 7.5, selection: "Over" }), { id: "1966", name: "LeBron James", league: "nba", teamId: "nba:LAL" }, "nba", "LAL"],
];
