/**
 * Team names as slips print them → a score against an ESPN team. Pure.
 * The nickname (Rams, Kings, Sox) weighs more than a city ("LA", "New York"), and a two-letter
 * abbreviation inside longer text ("LA Rams") is only a city hint, never a match on its own.
 */

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** City shorthand on slips → the city ESPN spells out. Applied to whole words only. */
const CITY: [RegExp, string][] = [
  [/\bla\b/g, "los angeles"], [/\bl a\b/g, "los angeles"], [/\bny\b/g, "new york"], [/\bnyc\b/g, "new york"], [/\bsf\b/g, "san francisco"],
  [/\bkc\b/g, "kansas city"], [/\btb\b/g, "tampa bay"], [/\blv\b/g, "las vegas"], [/\bvegas\b/g, "las vegas"], [/\bnola\b/g, "new orleans"],
  [/\bno\b(?= (saints|pelicans))/g, "new orleans"], [/\bgs\b/g, "golden state"], [/\bokc\b/g, "oklahoma city"], [/\bstl\b/g, "st louis"], [/\bsaint louis\b/g, "st louis"], [/\bphilly\b/g, "philadelphia"], [/\bwash\b/g, "washington"], [/\bdc\b/g, "washington"], [/\bchi\b/g, "chicago"],
  [/\bbos\b/g, "boston"], [/\bdal\b/g, "dallas"], [/\bhou\b/g, "houston"], [/\bmia\b/g, "miami"], [/\batl\b/g, "atlanta"], [/\bdet\b/g, "detroit"],
  [/\bmin\b/g, "minnesota"], [/\bmil\b/g, "milwaukee"], [/\bcle\b/g, "cleveland"], [/\bpit\b/g, "pittsburgh"], [/\bsea\b/g, "seattle"], [/\bden\b/g, "denver"],
  [/\bphx\b/g, "phoenix"], [/\bsd\b/g, "san diego"], [/\bsj\b/g, "san jose"], [/\btor\b/g, "toronto"], [/\bmtl\b/g, "montreal"],
];

/** Slip nicknames → the nickname ESPN uses. */
const NICK: Record<string, string> = {
  niners: "49ers", "9ers": "49ers", pats: "patriots", bucs: "buccaneers", jags: "jaguars", phins: "dolphins", fins: "dolphins", 
  "g men": "giants", gmen: "giants", iggles: "eagles", vikes: "vikings", skins: "commanders",
  commies: "commanders", bolts: "lightning", sixers: "76ers", "6ers": "76ers", mavs: "mavericks", cavs: "cavaliers", twolves: "timberwolves",
  "t wolves": "timberwolves", blazers: "trail blazers", dubs: "warriors", nugs: "nuggets", grizz: "grizzlies", pels: "pelicans", knicks: "knicks",
  habs: "canadiens", leafs: "maple leafs", pens: "penguins", caps: "capitals", canes: "hurricanes", avs: "avalanche", sens: "senators", nucks: "canucks",
  jackets: "blue jackets", cbj: "blue jackets", preds: "predators", yotes: "coyotes", isles: "islanders", "golden knights": "golden knights", 
  yanks: "yankees", halos: "angels", barves: "braves", buccos: "pirates", "d backs": "diamondbacks",
  dbacks: "diamondbacks", jays: "blue jays", "red sox": "red sox", "white sox": "white sox", chisox: "white sox", "chi sox": "white sox", 
  "man utd": "manchester united", "man united": "manchester united", "man city": "manchester city", gunners: "arsenal", "the reds": "liverpool",
  "the blues": "chelsea", toffees: "everton", villa: "aston villa", "west ham": "west ham united", wolverhampton: "wolverhampton wanderers", forest: "nottingham forest",
  barca: "barcelona", atleti: "atletico madrid", juve: "juventus", bayern: "bayern munich", psg: "paris saint germain",
  galaxy: "galaxy", "red bulls": "red bulls", sounders: "sounders", "inter miami": "inter miami",
};

/** Abbreviations slips print that differ from ESPN's, per league: "LAK" for ESPN's "LA" Kings. */
export const ALT_ABBR: Record<string, Record<string, string>> = {
  nhl: { lak: "la", sjs: "sj", tbl: "tb", njd: "nj", nyr: "nyr", nyi: "nyi", vgk: "vgk", wsh: "wsh", was: "wsh", mon: "mtl", clb: "cbj", lv: "vgk" },
  nba: { nyk: "ny", gsw: "gs", sas: "sa", nop: "no", pho: "phx", uta: "utah", bkn: "bkn", brk: "bkn", wsh: "wsh", was: "wsh", cha: "cha", lal: "lal", lac: "lac" },
  nfl: { lar: "lar", lac: "lac", la: "lar", gnb: "gb", kan: "kc", nwe: "ne", nor: "no", sfo: "sf", tam: "tb", jac: "jax", was: "wsh", lvr: "lv", oak: "lv" },
  mlb: { nyy: "nyy", nym: "nym", lad: "lad", laa: "laa", cws: "chw", chw: "chw", chc: "chc", sfg: "sf", sdp: "sd", tbr: "tb", kcr: "kc", wsn: "wsh", was: "wsh", az: "ari" },
  wnba: { nyl: "ny", lva: "lv", las: "la", gsv: "gs" },
  mls: { lafc: "lafc", lag: "la", nyc: "nyc", nyrb: "ny", rbny: "ny", mia: "mia" },
};

function expand(text: string): string {
  let x = ` ${norm(text)} `;
  for (const [k, v] of Object.entries(NICK)) x = x.replace(new RegExp(`\\b${k.trim().replace(/ /g, "\\s")}\\b`, "g"), v);
  for (const [re, v] of CITY) x = x.replace(re, v);
  return x.replace(/\s+/g, " ").trim();
}

/** Nickname words of an ESPN team name: "Los Angeles Rams" → "rams", "Boston Red Sox" → "red sox". */
const TWO_WORD = new Set(["red sox", "white sox", "blue jays", "maple leafs", "blue jackets", "golden knights", "trail blazers", "red wings", "red bulls", "inter miami"]);
export function nickOf(name: string): string {
  const w = norm(name).split(" ");
  while (w.length > 1 && ["fc", "sc", "cf", "afc"].includes(w[w.length - 1])) w.pop();
  const two = w.slice(-2).join(" ");
  return w.length >= 3 && TWO_WORD.has(two) ? two : w[w.length - 1] ?? "";
}

/**
 * How well text names a team. 6 full name, 5 nickname of two words or an exact abbreviation as the whole text,
 * 4 nickname, 3 a 3+ letter abbreviation inside text, 1 the city alone (or a 2-letter abbreviation inside text). 0 none.
 */
export function teamScoreLeague(text: string, t: { abbr: string; name: string }, league?: string): number {
  const raw = norm(text);
  if (!raw) return 0;
  const x = expand(text);
  const name = expand(t.name);
  const abbr = norm(t.abbr).replace(/ /g, "");
  const tokens = new Set(raw.split(" "));
  const xTokens = ` ${x} `;
  if (x === name || xTokens.includes(` ${name} `)) return 6;
  const alt = league ? ALT_ABBR[league] ?? {} : {};
  const whole = raw.replace(/ /g, "");
  if (abbr && (whole === abbr || alt[whole] === abbr)) return 5;
  const nick = nickOf(t.name);
  const city = name.slice(0, Math.max(0, name.length - nick.length)).trim();
  // Other cities out of the way: "Kansas City" is not Manchester City's "City"; "LA Kings" is not Sacramento's Kings.
  let y = xTokens;
  for (const c of CITY_NAMES) if (c !== city && !city.includes(c)) y = y.split(` ${c} `).join(" # ");
  const hasNick = nick.length >= 3 && y.includes(` ${nick} `);
  if (hasNick) return y.includes(` # ${nick} `) ? 0 : nick.includes(" ") ? 5 : 4;
  // Names slips use that are not the last word of ESPN's ("Spurs" for Tottenham Hotspur, "Wolves" for Wolverhampton).
  const extra = TEAM_ALIASES[norm(t.name)];
  if (extra?.some((a) => xTokens.includes(` ${a} `))) return 4;
  const altHit = [...tokens].some((tk) => alt[tk] === abbr);
  if (abbr.length >= 3 && (tokens.has(abbr) || altHit)) return 3;
  if (city.length >= 4 && xTokens.includes(` ${city} `)) return 1;
  if (abbr.length === 2 && tokens.has(abbr)) return 1;
  return 0;
}

const TEAM_ALIASES: Record<string, string[]> = {
  "tottenham hotspur": ["spurs", "tottenham"], "wolverhampton wanderers": ["wolves"], "brighton and hove albion": ["brighton", "seagulls"],
  "new york city fc": ["nycfc"], "internazionale": ["inter", "inter milan"], "ac milan": ["milan"], "paris saint germain": ["psg"],
  "afc bournemouth": ["bournemouth", "cherries"], "nottingham forest": ["forest"], "newcastle united": ["newcastle", "magpies", "toon"],
  "west ham united": ["west ham", "hammers"], "manchester united": ["man u"], "atletico madrid": ["atleti"], "bayern munich": ["bayern"],
  "philadelphia 76ers": ["sixers"], "portland trail blazers": ["blazers"], "minnesota timberwolves": ["wolves", "twolves"],
  "lafc": ["los angeles fc"], "inter miami cf": ["inter miami"],
};

const CITY_NAMES = [
  "los angeles", "new york", "san francisco", "kansas city", "tampa bay", "las vegas", "new orleans", "golden state", "oklahoma city", "st louis", "philadelphia",
  "washington", "chicago", "boston", "dallas", "houston", "miami", "atlanta", "detroit", "minnesota", "milwaukee", "cleveland", "pittsburgh", "seattle", "denver",
  "phoenix", "san diego", "san jose", "toronto", "montreal", "sacramento", "brooklyn", "arizona", "baltimore", "buffalo", "carolina", "charlotte", "cincinnati",
  "green bay", "indianapolis", "jacksonville", "new england", "tennessee", "orlando", "portland", "memphis", "san antonio", "anaheim", "calgary", "edmonton",
  "vancouver", "winnipeg", "ottawa", "nashville", "columbus", "colorado", "florida", "new jersey", "oakland", "texas",
];

/** Sport implied by a prop or bet market, for breaking a tie between leagues. Null = no hint. */
export function leaguesForMarket(market: string): string[] | null {
  const m = market.toLowerCase();
  if (/pass(ing)?|rush(ing)?|receiving|receptions?|touchdown|\btd\b|completions?|interceptions?|sacks?|tackles?\b(?!.*soccer)|field goals?|longest/.test(m)) return ["nfl", "ncaaf"];
  if (/rebounds?|assists?.*points|points.*rebounds|3-?p|threes|steals|blocks|pra\b/.test(m)) return ["nba", "wnba", "ncaam", "ncaaw"];
  if (/strikeouts?|total bases|home runs?|\bhits?\b|rbis?|runs? scored|innings|earned runs|pitcher/.test(m)) return ["mlb"];
  if (/shots? on goal|\bsog\b|saves|power play|goalie|puck/.test(m)) return ["nhl", "epl", "mls", "ucl", "laliga", "seriea", "bundesliga"];
  if (/aces|double faults|games won|total games|sets/.test(m)) return ["atp", "wta"];
  return null;
}

/** A spread number's likely leagues: ±1.5 is a puck or run line; big numbers are football or basketball. Null = no hint. */
export function leaguesForSpread(line: number | null | undefined): string[] | null {
  if (line == null || !Number.isFinite(line)) return null;
  const a = Math.abs(line);
  if (a === 1.5) return ["nhl", "mlb", "epl", "mls"];
  if (a >= 2.5) return ["nfl", "ncaaf", "nba", "wnba", "ncaam", "ncaaw"];
  return null;
}
