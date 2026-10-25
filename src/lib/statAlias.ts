/**
 * Prop stat names from every book we see on slips (DraftKings + Pick6, PrizePicks, Underdog, Sleeper, Betr,
 * ParlayPlay, Dabble, Power Play-style books) mapped to the one stat label the tracker computes from ESPN.
 *
 * Matching is order-free: "Att 2-pt", "2-pt att", "2PA" and "Two Pointers Attempted" all reduce to the same
 * token key. Combos split on "+" so "Pts + Rebs + Asts", "Reb+Ast" and "P+R+A" resolve too. Pure, no I/O.
 */

export type StatSport = "basketball" | "football" | "baseball" | "hockey";

/** Canonical label → aliases ("|" separated). Labels are what the tracker's marketTerms reads. */
const RAW: Record<string, { sports: StatSport[]; short: string; aliases: string }> = {
  // ── Basketball (NBA, WNBA, NCAAB) ──
  points: { sports: ["basketball", "hockey"], short: "Points", aliases: "points|pts|point|player points|total points|pts scored|points scored|pnts|player pts" },
  rebounds: { sports: ["basketball"], short: "Rebounds", aliases: "rebounds|reb|rebs|rebound|player rebounds|total rebounds|trb|boards|rbs" },
  assists: { sports: ["basketball", "hockey"], short: "Assists", aliases: "assists|ast|asts|assist|player assists|dimes" },
  "3-pointers": { sports: ["basketball"], short: "3-pt made", aliases: "3-pointers|3-pointers made|3 pointers made|3-pt made|3pt made|3pm|3ptm|3-pt|3pt|threes|threes made|three pointers made|three-pointers made|3-point field goals made|3 point fg made|3pt fg made|made threes|3s made|3fgm|player threes|player three pointers made|three point field goals|3pt fgm|3-pointers made (3pm)|3 pt made|3pts made|threes hit" },
  "threes attempted": { sports: ["basketball"], short: "3-pt att", aliases: "threes attempted|3-pt attempted|3pt attempted|3pa|3pta|3-pt att|3pt att|3 pt att|3-point attempts|3 point attempts|three point attempts|three pointers attempted|three-pointers attempted|3-pointers attempted|3 pointers attempted|3-point field goals attempted|3fga|3pt fga|3-pt fga|3s attempted|three point field goal attempts|threes att|3pts attempted|3 pointers att" },
  "two-pointers made": { sports: ["basketball"], short: "2-pt made", aliases: "two-pointers made|two pointers made|2-pt made|2pt made|2pm|2ptm|2-pointers made|2 pointers made|2-point field goals made|2 point fg made|2pt fg made|2fgm|twos made|2s made|2-pt fgm|two point field goals made|2 pt made" },
  "two-pointers attempted": { sports: ["basketball"], short: "2-pt att", aliases: "two-pointers attempted|two pointers attempted|2-pt att|2pt att|2 pt att|2-pt attempted|2pt attempted|2pa|2pta|2-point attempts|2 point attempts|two point attempts|2-pointers attempted|2 pointers attempted|2-point field goals attempted|2fga|2pt fga|2-pt fga|twos attempted|2s attempted|two point field goal attempts|2pt attempts|two pointers att|2-pt fg att|2 pointers att" },
  "field goals made": { sports: ["basketball", "football"], short: "FG made", aliases: "field goals made|fg made|fgm|fgs made|field goals|made field goals|fg|field goal made|field goals made (fgm)" },
  "field goals attempted": { sports: ["basketball", "football"], short: "FG att", aliases: "field goals attempted|fg attempted|fga|fg att|fg attempts|field goal attempts|shots attempted|shot attempts|fgs attempted|field goal att" },
  "free throws made": { sports: ["basketball"], short: "FT made", aliases: "free throws made|ft made|ftm|free throws|fts made|made free throws|free throw made" },
  "free throws attempted": { sports: ["basketball"], short: "FT att", aliases: "free throws attempted|ft attempted|fta|ft att|free throw attempts|fts attempted|ft attempts" },
  "offensive rebounds": { sports: ["basketball"], short: "Off reb", aliases: "offensive rebounds|oreb|orebs|off reb|off rebs|off rebounds|offensive reb|o-reb|o reb|offensive boards" },
  "defensive rebounds": { sports: ["basketball"], short: "Def reb", aliases: "defensive rebounds|dreb|drebs|def reb|def rebs|def rebounds|defensive reb|d-reb|d reb|defensive boards" },
  "personal fouls": { sports: ["basketball"], short: "Fouls", aliases: "personal fouls|fouls|pf|pfs|foul|player fouls|fouls committed" },
  steals: { sports: ["basketball"], short: "Steals", aliases: "steals|stl|stls|steal|player steals" },
  blocks: { sports: ["basketball", "hockey"], short: "Blocks", aliases: "blocks|blk|blks|block|blocked shots|player blocks|rejections|blocked shot|bs" },
  turnovers: { sports: ["basketball"], short: "Turnovers", aliases: "turnovers|tov|tovs|turnover|player turnovers|tos|giveaways" },
  "steals + blocks": { sports: ["basketball"], short: "Stl+Blk", aliases: "steals + blocks|blocks + steals|blks+stls|stls+blks|blk+stl|stl+blk|stocks|s+b|b+s|steals+blocks|blocks+steals|blk + stl|stl + blk|blocks and steals|steals and blocks|stl+blk combo" },
  "points + rebounds + assists": { sports: ["basketball"], short: "Pts+Reb+Ast", aliases: "points + rebounds + assists|pts+rebs+asts|pts + rebs + asts|pra|p+r+a|pts+reb+ast|points rebounds assists|points+rebounds+assists|pts/reb/ast|pts reb ast|player pra|points, rebounds & assists|pts + reb + ast" },
  "points + rebounds": { sports: ["basketball"], short: "Pts+Reb", aliases: "points + rebounds|pts+rebs|pts + rebs|pr|p+r|pts+reb|points+rebounds|points & rebounds|pts/reb|pts + reb" },
  "points + assists": { sports: ["basketball"], short: "Pts+Ast", aliases: "points + assists|pts+asts|pts + asts|p+a|pa|pts+ast|points+assists|points & assists|pts/ast|pts + ast" },
  "rebounds + assists": { sports: ["basketball"], short: "Reb+Ast", aliases: "rebounds + assists|rebs+asts|rebs + asts|ra|r+a|reb+ast|rebounds+assists|rebounds & assists|reb/ast|reb + ast" },
  "double-double": { sports: ["basketball"], short: "Double-double", aliases: "double-double|double double|double doubles|double-doubles|dbl dbl|dbl-dbl|dd|to record a double-double|player double double" },
  "triple-double": { sports: ["basketball"], short: "Triple-double", aliases: "triple-double|triple double|triple doubles|triple-doubles|trpl dbl|trp dbl|to record a triple-double|player triple double" },
  "minutes played": { sports: ["basketball"], short: "Minutes", aliases: "minutes played|minutes|mins|min played|mins played" },
  "fantasy score": { sports: ["basketball", "football"], short: "Fantasy score", aliases: "fantasy score|fantasy points|fantasy pts|fpts|fs|fantasy|player fantasy score|fantasy score (pp)|prizepicks fantasy score" },
  // ── Football (NFL, NCAAF) ──
  "passing yards": { sports: ["football"], short: "Pass yds", aliases: "passing yards|pass yds|pass yards|passing yds|py|pass yd|passing yard|player passing yards|qb passing yards|pass yds (qb)|yds passing" },
  "rushing yards": { sports: ["football"], short: "Rush yds", aliases: "rushing yards|rush yds|rush yards|rushing yds|ry|rush yd|player rushing yards|yds rushing" },
  "receiving yards": { sports: ["football"], short: "Rec yds", aliases: "receiving yards|rec yds|rec yards|receiving yds|recv yds|rec yd|player receiving yards|yds receiving" },
  receptions: { sports: ["football"], short: "Receptions", aliases: "receptions|rec|recs|catches|reception|total receptions|player receptions|catch" },
  targets: { sports: ["football"], short: "Targets", aliases: "targets|tgts|tgt|receiving targets|rec targets|target" },
  completions: { sports: ["football"], short: "Completions", aliases: "completions|comp|comps|cmp|pass completions|passes completed|completed passes|pass comp|completion" },
  "pass attempts": { sports: ["football"], short: "Pass att", aliases: "pass attempts|passing attempts|pass att|pass atts|att passing|passing att" },
  "rush attempts": { sports: ["football"], short: "Rush att", aliases: "rush attempts|rushing attempts|rush att|rush atts|carries|car|rushes|carry|rushing att" },
  "passing touchdowns": { sports: ["football"], short: "Pass TDs", aliases: "passing touchdowns|pass tds|pass td|passing tds|passing td|td passes|touchdown passes|ptd|pass touchdowns" },
  "rushing touchdowns": { sports: ["football"], short: "Rush TDs", aliases: "rushing touchdowns|rush tds|rush td|rushing tds|rushing td|rush touchdowns" },
  "receiving touchdowns": { sports: ["football"], short: "Rec TDs", aliases: "receiving touchdowns|rec tds|rec td|receiving tds|receiving td|rec touchdowns" },
  "rush + rec touchdowns": { sports: ["football"], short: "Rush+Rec TDs", aliases: "rush + rec tds|rush+rec tds|rushing + receiving tds|rush + rec td|rush+rec td|rush + rec touchdowns|rushing + receiving touchdowns" },
  "anytime touchdown": { sports: ["football"], short: "Anytime TD", aliases: "anytime touchdown|anytime td|anytime td scorer|anytime touchdown scorer|tds scored|touchdowns|td scorer|touchdown scorer|to score a td|to score a touchdown" },
  interceptions: { sports: ["football"], short: "INTs", aliases: "interceptions|int|ints|interceptions thrown|ints thrown|interception|pass ints|passing interceptions|int thrown" },
  "rushing + receiving yards": { sports: ["football"], short: "Rush+Rec yds", aliases: "rushing + receiving yards|rush+rec yds|rush + rec yds|rush + rec yards|rush+rec yards|rush & rec yds|scrimmage yards|rushing and receiving yards|rush/rec yds|rec + rush yds|rec+rush yds|rush+rec|scrim yds" },
  "passing + rushing yards": { sports: ["football"], short: "Pass+Rush yds", aliases: "passing + rushing yards|pass+rush yds|pass + rush yds|pass + rush yards|passing+rushing yards|pass & rush yds|pass/rush yds|rush + pass yds|pass+rush|passing and rushing yards" },
  "longest rush": { sports: ["football"], short: "Longest rush", aliases: "longest rush|long rush|longest run|lng rush|longest rush attempt|rush long" },
  "longest reception": { sports: ["football"], short: "Longest rec", aliases: "longest reception|long reception|longest rec|longest catch|lng rec|long rec|rec long" },
  "longest completion": { sports: ["football"], short: "Longest comp", aliases: "longest completion|longest pass completion|longest pass|long completion|lng comp|longest pass completed|pass long" },
  tackles: { sports: ["football"], short: "Tackles", aliases: "tackles|tackles + assists|tackles+ast|tackles + ast|tkl+ast|tackles+assists|total tackles|tkl|tkls|tackle|tackles and assists|tackles & assists|tackles+asts|tot tackles" },
  "solo tackles": { sports: ["football"], short: "Solo tackles", aliases: "solo tackles|solo tkl|solo|solo tackle|solo tkls" },
  "assisted tackles": { sports: ["football"], short: "Ast tackles", aliases: "assisted tackles|ast tackles|tackle assists|assisted tkl|tackles assisted" },
  sacks: { sports: ["football"], short: "Sacks", aliases: "sacks|sack|defensive sacks|player sacks|sacks made" },
  "tackles for loss": { sports: ["football"], short: "TFL", aliases: "tackles for loss|tfl|tfls|tackle for loss" },
  "passes defended": { sports: ["football"], short: "Pass def", aliases: "passes defended|pd|pass deflections|passes defensed|pass breakups" },
  "extra points made": { sports: ["football"], short: "XP made", aliases: "extra points made|xp made|xpm|pat made|pats made|extra points|xp|xps made" },
  "kicking points": { sports: ["football"], short: "Kicking pts", aliases: "kicking points|kicking pts|kick pts|kicker points|kicking|k pts" },
  "longest field goal": { sports: ["football"], short: "Longest FG", aliases: "longest field goal|longest fg|longest field goal made|long fg|lng fg" },
  "fumbles lost": { sports: ["football"], short: "Fumbles lost", aliases: "fumbles lost|fum lost|fumble lost|lost fumbles" },
  // ── Baseball (MLB) ──
  hits: { sports: ["baseball", "hockey"], short: "Hits", aliases: "hits|h|hit|batter hits|player hits|total hits|hitter hits" },
  runs: { sports: ["baseball"], short: "Runs", aliases: "runs|runs scored|r|run|batter runs|player runs" },
  rbis: { sports: ["baseball"], short: "RBIs", aliases: "rbis|rbi|runs batted in|batter rbis|player rbis|r.b.i." },
  "home runs": { sports: ["baseball"], short: "Home runs", aliases: "home runs|hr|hrs|home run|homers|homer|batter home runs|to hit a home run|dingers" },
  walks: { sports: ["baseball"], short: "Walks", aliases: "walks|bb|batter walks|walk|walks drawn|base on balls|hitter walks" },
  strikeouts: { sports: ["baseball"], short: "Strikeouts", aliases: "strikeouts|k|ks|so|pitcher strikeouts|strikeouts thrown|pitcher ks|batter strikeouts|hitter strikeouts|strike outs|strikeout|total strikeouts|pitching strikeouts|p ks" },
  "hits + runs + rbis": { sports: ["baseball"], short: "H+R+RBI", aliases: "hits + runs + rbis|h+r+rbi|h+r+rbis|hits+runs+rbis|hrr|hits runs rbis|hits + runs + rbi|h + r + rbi|hits/runs/rbis|hits, runs & rbis" },
  "total bases": { sports: ["baseball"], short: "Total bases", aliases: "total bases|tb|bases|total bases (from hits)|batter total bases|tbs" },
  singles: { sports: ["baseball"], short: "Singles", aliases: "singles|single|1b|batter singles" },
  doubles: { sports: ["baseball"], short: "Doubles", aliases: "doubles|2b|batter doubles" },
  triples: { sports: ["baseball"], short: "Triples", aliases: "triples|3b|batter triples" },
  "extra base hits": { sports: ["baseball"], short: "XBH", aliases: "extra base hits|xbh|extra-base hits|extra base hit" },
  "earned runs allowed": { sports: ["baseball"], short: "Earned runs", aliases: "earned runs allowed|earned runs|er|era allowed|pitcher earned runs|er allowed|earned run" },
  "hits allowed": { sports: ["baseball"], short: "Hits allowed", aliases: "hits allowed|hits against|pitcher hits allowed|h allowed|hits given up|ha" },
  "walks allowed": { sports: ["baseball"], short: "Walks allowed", aliases: "walks allowed|pitcher walks|walks issued|bb allowed|walks given up|pitcher walks allowed" },
  "runs allowed": { sports: ["baseball"], short: "Runs allowed", aliases: "runs allowed|pitcher runs allowed|runs given up|r allowed" },
  "outs recorded": { sports: ["baseball"], short: "Outs", aliases: "outs recorded|pitching outs|outs|pitcher outs|outs (pitcher)|recorded outs|pitcher outs recorded" },
  "pitches thrown": { sports: ["baseball"], short: "Pitches", aliases: "pitches thrown|pitch count|pitches|total pitches|pitcher pitches" },
  // ── Hockey (NHL) ──
  goals: { sports: ["hockey"], short: "Goals", aliases: "goals|goal|g|player goals|goals scored|anytime goal|anytime goal scorer|anytime goalscorer" },
  "shots on goal": { sports: ["hockey"], short: "SOG", aliases: "shots on goal|sog|shots|player shots on goal|shots on net|shots on goal (sog)|s.o.g." },
  saves: { sports: ["hockey"], short: "Saves", aliases: "saves|goalie saves|goaltender saves|sv|save|saves made" },
  "goals against": { sports: ["hockey"], short: "Goals against", aliases: "goals against|goals allowed|ga|goalie goals against|goals allowed (goalie)" },
  "faceoffs won": { sports: ["hockey"], short: "Faceoffs won", aliases: "faceoffs won|faceoff wins|fow|face offs won|faceoffs" },
  "penalty minutes": { sports: ["hockey"], short: "PIM", aliases: "penalty minutes|pim|pims" },
  "hockey points": { sports: ["hockey"], short: "Points", aliases: "goals + assists|goals+assists|g+a|hockey points|nhl points|player points (nhl)" },
};

/** Stats no box score or play feed gives us. Shown with the reason, never as a guess. */
export const NOT_TRACKABLE: { re: RegExp; label: string; reason: string }[] = [
  { re: /\bdunks?\b/i, label: "Dunks", reason: "ESPN's box score has no dunk count, and the play feed doesn't tag every dunk" },
  { re: /first\s*(basket|field\s*goal|bucket|fg|score)|1st\s*(basket|fg)/i, label: "First basket", reason: "a race between every player, not a stat line in the box score" },
  { re: /(first|1st|last)\s*(td|touchdown)(\s*scorer)?|first\s*goal\s*scorer|last\s*goal/i, label: "First or last scorer", reason: "a race between every player, not a stat line in the box score" },
  { re: /stolen\s*bases?|\bsbs?\b/i, label: "Stolen bases", reason: "ESPN's MLB box has no stolen-base column per batter" },
  { re: /(hitter|batter)\s*fantasy|fantasy.*(hitter|batter)/i, label: "Hitter fantasy score", reason: "the scoring needs hit-by-pitch and stolen bases, which ESPN's box doesn't list" },
  { re: /pitcher\s*fantasy|fantasy.*pitch/i, label: "Pitcher fantasy score", reason: "the scoring needs wins and quality starts, which ESPN's player box doesn't list" },
  { re: /power\s*play\s*points?|\bppp\b/i, label: "Power play points", reason: "ESPN's NHL box doesn't split points by power play" },
  { re: /time\s*on\s*ice|\btoi\b/i, label: "Time on ice", reason: "posted as minutes:seconds; no book line we can grade the same way" },
  { re: /first\s*downs?/i, label: "First downs", reason: "ESPN's player box has no first-down count" },
  { re: /hit\s*by\s*pitch|\bhbp\b/i, label: "Hit by pitch", reason: "not in ESPN's player box" },
  { re: /pitcher\s*wins?|to\s*record\s*(a\s*)?win|quality\s*start/i, label: "Pitcher win or quality start", reason: "ESPN's player box doesn't mark the decision per pitcher" },
  { re: /first\s*\d+\s*min/i, label: "First-minutes props", reason: "ESPN gives quarters and halves, not a split for the first few minutes" },
];

export type Resolved = { label: string; confidence: number; via: "alias" | "combo" | "fuzzy" };

// ── Tokenizer ──
const PHRASES: [RegExp, string][] = [
  [/\bfield[\s-]*goals?\b/g, " fg "],
  [/\bfree[\s-]*throws?\b/g, " ft "],
  [/\bdouble[\s-]*doubles?\b/g, " dbldbl "],
  [/\btriple[\s-]*doubles?\b/g, " trpdbl "],
  [/\bhome[\s-]*runs?\b/g, " hr "],
  [/\bstrike[\s-]*outs?\b/g, " k "],
  [/\bextra[\s-]*base[\s-]*hits?\b/g, " xbh "],
  [/\bextra[\s-]*points?\b/g, " xp "],
  [/\bruns[\s-]*batted[\s-]*in\b/g, " rbi "],
  [/\bshots[\s-]*on[\s-]*(goal|net)\b/g, " sog "],
  [/\bface[\s-]*offs?\b/g, " faceoff "],
  [/\bpenalty[\s-]*minutes?\b/g, " pim "],
  [/\btotal[\s-]*bases\b/g, " tb "],
  [/\bbases?[\s-]*on[\s-]*balls\b/g, " bb "],
  // Shooting: "2-pt", "2PT", "2pa", "two pointers", "3-point", "threes".
  [/\b(?:2|two)[\s-]*(?:pointers?|points?|pts?|p)(?=$|[\s+/,)(-]|a\b|m\b|a\s|m\s|att|made|fg)/g, " two "],
  [/\b(?:3|three)[\s-]*(?:pointers?|points?|pts?|p)(?=$|[\s+/,)(-]|a\b|m\b|a\s|m\s|att|made|fg)/g, " three "],
  [/\bthrees\b|\b3'?s\b/g, " three "],
  [/\btwos\b|\b2'?s\b/g, " two "],
  [/\s*(?:&|\band\b|\bplus\b|\/|,)\s*/g, " + "],
];

const SYN: Record<string, string | string[]> = {
  points: "pts", point: "pts", pnts: "pts",
  rebounds: "reb", rebound: "reb", rebs: "reb", rbs: "reb",
  assists: "ast", assist: "ast", asts: "ast",
  steals: "stl", steal: "stl", stls: "stl",
  blocks: "blk", block: "blk", blks: "blk", blocked: "blk",
  turnovers: "tov", turnover: "tov", tovs: "tov", tos: "tov",
  attempts: "att", attempt: "att", attempted: "att", atts: "att", attempting: "att",
  makes: "made", make: "made",
  yards: "yds", yard: "yds", yd: "yds",
  touchdowns: "td", touchdown: "td", tds: "td",
  interceptions: "int", interception: "int", ints: "int",
  completions: "comp", completion: "comp", comps: "comp", cmp: "comp", completed: "comp",
  receptions: "recs", reception: "recs", catches: "recs", catch: "recs",
  receiving: "rec", recv: "rec",
  passing: "pass", passes: "pass",
  rushing: "rush", rushes: "rush",
  carries: "carries", carry: "carries",
  targets: "tgt", target: "tgt", tgts: "tgt",
  longest: "long", lng: "long",
  sacks: "sack",
  tackles: "tkl", tackle: "tkl", tkls: "tkl",
  rbis: "rbi",
  hit: "hits",
  run: "runs",
  ks: "k", so: "k",
  walks: "bb", walk: "bb",
  homers: "hr", homer: "hr", hrs: "hr",
  singles: "single", doubles: "double", triples: "triple",
  saves: "sv", save: "sv",
  goal: "goals",
  fouls: "foul", pfs: "pf",
  offensive: "off", defensive: "def",
  oreb: ["off", "reb"], orebs: ["off", "reb"], dreb: ["def", "reb"], drebs: ["def", "reb"],
  fga: ["fg", "att"], fgm: ["fg", "made"], fta: ["ft", "att"], ftm: ["ft", "made"],
  fgs: "fg", fts: "ft",
  fpts: ["fantasy", "pts"],
  allowed: "allowed", against: "allowed", given: "allowed", issued: "allowed", conceded: "allowed",
  pitching: "pitcher", pitchers: "pitcher",
  batter: "hitter", batting: "hitter", hitters: "hitter",
  minutes: "min", mins: "min",
  faceoffs: "faceoff", wins: "won", win: "won",
  pims: "pim", giveaways: "tov",
};
const FILLER = new Set(["player", "players", "total", "totals", "the", "of", "o", "u", "over", "under", "more", "less", "higher", "lower", "prop", "props", "stat", "stats", "alt", "combo", "combined", "pp", "pick", "picks", "leg", "an", "for", "in", "by", "game", "full", "x", "ou"]);

function tokens(raw: string, strict: boolean): string[] {
  let s = ` ${raw.toLowerCase().replace(/[’']/g, "")} `;
  // Prices, lines, multipliers: "11.5", "-115", "3.2x", "(+)".
  s = s.replace(/[+-]\d{3,4}\b/g, " ").replace(/\b\d+\.\d+x?\b/g, " ").replace(/\(\s*\+\s*\)/g, " ");
  for (const [re, to] of PHRASES) s = s.replace(re, to);
  s = s.replace(/[^a-z0-9+]+/g, " ").replace(/\+/g, " + ");
  // Split letter-digit boundaries ("3pm" was rewritten; keep "1b"/"2b"/"3b" whole).
  const out: string[] = [];
  for (const t0 of s.split(/\s+/).filter(Boolean)) {
    if (/^[123]b$/.test(t0)) { out.push(t0); continue; }
    if (/^\d+$/.test(t0)) continue;
    if (t0 === "to" && !strict) continue;
    if (t0 === "a" && !strict) {
      out.push("a");
      continue;
    }
    if (FILLER.has(t0)) continue;
    const syn = SYN[t0];
    if (Array.isArray(syn)) out.push(...syn);
    else out.push(syn ?? t0);
  }
  // Drop leading/trailing/double "+".
  const clean: string[] = [];
  for (const t of out) if (!(t === "+" && (clean.length === 0 || clean[clean.length - 1] === "+"))) clean.push(t);
  while (clean[clean.length - 1] === "+") clean.pop();
  return clean;
}

/** Order-free key: "Att 2-pt" and "2-pt att" give the same key. */
export function statKey(raw: string, strict = true): string {
  return [...tokens(raw, strict)].sort().join(" ");
}

type Entry = { label: string; sports: StatSport[] };
const INDEX = new Map<string, Entry>();
const ATOMS = new Map<string, Entry>();
for (const [label, def] of Object.entries(RAW)) {
  for (const a of def.aliases.split("|")) {
    const k = statKey(a);
    if (!k) continue;
    if (!INDEX.has(k)) INDEX.set(k, { label, sports: def.sports });
    if (!a.includes("+") && !ATOMS.has(k)) ATOMS.set(k, { label, sports: def.sports });
  }
}
/** Every word that appears in an alias or a synonym, for spelling repair. */
const VOCAB = new Set<string>([...Object.keys(SYN), ...Object.values(RAW).flatMap((d) => d.aliases.toLowerCase().split(/[^a-z]+/))].filter((w) => w.length >= 4));
/** "TO" only means turnovers when it stands alone as the stat. */
INDEX.set("to", { label: "turnovers", sports: ["basketball"] });

export const aliasCount = () => [...Object.values(RAW)].reduce((n, d) => n + d.aliases.split("|").length, 0) + 1;
export const CANON_LABELS = Object.keys(RAW);
export const shortStat = (label: string): string => RAW[label]?.short ?? label.charAt(0).toUpperCase() + label.slice(1);
export const statSports = (label: string): StatSport[] => RAW[label]?.sports ?? [];

const SPORT_OF: Record<string, StatSport> = { nba: "basketball", wnba: "basketball", ncaam: "basketball", ncaaw: "basketball", nfl: "football", ncaaf: "football", mlb: "baseball", nhl: "hockey" };
export const statSportOf = (league?: string | null): StatSport | null => (league ? SPORT_OF[league] ?? null : null);

/** Sport-specific readings of the same words ("Points" in hockey, "Blocks" in hockey). */
function forSport(label: string, sport: StatSport | null): string {
  if (sport === "hockey" && label === "points") return "hockey points";
  if (sport === "hockey" && label === "blocks") return "blocks";
  if (sport === "baseball" && label === "tackles") return label;
  if (sport === "football" && label === "assists") return "assisted tackles";
  return label;
}

/** Hoops combos we sum generically ("Pts+Reb+Ast+Stl"). Ordered for a stable label. */
const COMBO_ORDER = ["points", "rebounds", "assists", "steals", "blocks", "turnovers", "3-pointers"];
const KNOWN_COMBO: Record<string, string> = {
  "points|rebounds|assists": "points + rebounds + assists",
  "points|rebounds": "points + rebounds",
  "points|assists": "points + assists",
  "rebounds|assists": "rebounds + assists",
  "steals|blocks": "steals + blocks",
  "hits|runs|rbis": "hits + runs + rbis",
  "rushing yards|receiving yards": "rushing + receiving yards",
  "passing yards|rushing yards": "passing + rushing yards",
  "rushing touchdowns|receiving touchdowns": "rush + rec touchdowns",
  "goals|assists": "hockey points",
  "tackles|assists": "tackles",
};

function comboOf(text: string, sport: StatSport | null): string | null {
  const parts = text.split(/\s*(?:\+|&|\band\b|\/)\s*/i).map((p) => p.trim()).filter(Boolean);
  if (parts.length < 2) return null;
  // "Rush + Rec Yds": the unit on the last part covers the others.
  const unit = parts[parts.length - 1].match(/\b(yds|yards|yd|tds?|touchdowns?)\b/i)?.[1];
  const labels: string[] = [];
  for (const p of parts) {
    const withUnit = unit && !new RegExp(`\\b${unit}\\b`, "i").test(p) ? `${p} ${unit}` : p;
    const hit = INDEX.get(statKey(withUnit)) ?? INDEX.get(statKey(p));
    if (!hit || hit.label.includes(" + ")) return null;
    labels.push(hit.label);
  }
  const uniq = [...new Set(labels)];
  const known = KNOWN_COMBO[uniq.join("|")] ?? KNOWN_COMBO[[...uniq].reverse().join("|")];
  if (known) return known;
  if (sport !== "football" && uniq.every((l) => COMBO_ORDER.includes(l))) return uniq.sort((a, b) => COMBO_ORDER.indexOf(a) - COMBO_ORDER.indexOf(b)).join(" + ");
  return null;
}

function lev(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}

export const FUZZY_MIN = 0.82;

/**
 * The stat a piece of slip text names. `strict` = the whole text is the stat column (so a bare "TO" is turnovers).
 * Null when nothing reaches the confidence bar: the caller shows the slip's own words instead of guessing.
 */
export function resolveStat(text: string, opts: { league?: string | null; strict?: boolean } = {}): Resolved | null {
  const sport = statSportOf(opts.league);
  const strict = opts.strict ?? true;
  const raw = text.trim();
  if (!raw) return null;
  const k = statKey(raw, strict);
  if (!k) return null;
  const hit = INDEX.get(k);
  if (hit) return { label: forSport(hit.label, sport), confidence: 1, via: "alias" };
  const combo = /\+|&|\band\b|\//i.test(raw) ? comboOf(raw, sport) : null;
  if (combo) return { label: combo, confidence: 0.95, via: "combo" };
  // Fuzzy: closest alias key by edit distance on the compact form.
  const compact = k.replace(/\s+/g, "");
  if (compact.length < 4) return null;
  let best: { label: string; score: number } | null = null;
  for (const [key, e] of INDEX) {
    const c = key.replace(/\s+/g, "");
    if (Math.abs(c.length - compact.length) > 3) continue;
    const score = 1 - lev(c, compact) / Math.max(c.length, compact.length);
    if (!best || score > best.score) best = { label: e.label, score };
  }
  if (best && best.score >= FUZZY_MIN) return { label: forSport(best.label, sport), confidence: Math.round(best.score * 100) / 100, via: "fuzzy" };
  // Word-level spelling fix ("Rebouds", "Pasing Yards"): swap each unknown word for the closest known word.
  const words = raw.toLowerCase().replace(/[^a-z0-9+ ]+/g, " ").split(/\s+/).filter(Boolean);
  let fixed = 0;
  let worst = 1;
  const mended = words.map((w) => {
    if (w.length < 5 || VOCAB.has(w) || /\d/.test(w)) return w;
    let bw = "";
    let bs = 0;
    for (const v of VOCAB) {
      if (v.length < 4 || Math.abs(v.length - w.length) > 2) continue;
      const sc = 1 - lev(v, w) / Math.max(v.length, w.length);
      if (sc > bs) { bs = sc; bw = v; }
    }
    if (bs >= FUZZY_MIN - 0.05) { fixed++; worst = Math.min(worst, bs); return bw; }
    return w;
  });
  if (fixed) {
    const h = INDEX.get(statKey(mended.join(" "), strict));
    if (h) return { label: forSport(h.label, sport), confidence: Math.round(worst * 100) / 100, via: "fuzzy" };
  }
  return null;
}

/** Scans a longer line ("Anthony Edwards Over 11.5 2-pt att -120") for the longest stat phrase in it. */
export function findStatIn(line: string, league?: string | null): Resolved | null {
  const words = line.replace(/[+-]\d{3,4}\b/g, " ").split(/\s+/).filter(Boolean);
  for (let len = Math.min(7, words.length); len >= 1; len--) {
    for (let i = words.length - len; i >= 0; i--) {
      const w = words.slice(i, i + len).join(" ");
      if (/^[\d.]+$/.test(w)) continue;
      const k = statKey(w, false);
      if (!k) continue;
      const hit = INDEX.get(k);
      if (hit && (len > 1 || k.length > 1)) return { label: forSport(hit.label, statSportOf(league)), confidence: 1, via: "alias" };
    }
  }
  return null;
}

/** Stats we follow in some leagues but not others (ESPN posts different box columns per league). */
export const LEAGUE_NOT_TRACKABLE: { leagues: string[]; re: RegExp; label: string; reason: string }[] = [
  { leagues: ["nhl", "mlb"], re: /fantasy/i, label: "Fantasy score", reason: "book scoring for this sport needs stats ESPN's box doesn't list" },
  { leagues: ["ncaaf"], re: /\btargets?\b|\btgts?\b/i, label: "Targets", reason: "ESPN's college box has no targets column" },
];

export function notTrackableReason(text: string, league?: string | null): { label: string; reason: string } | null {
  const lg = league ? LEAGUE_NOT_TRACKABLE.find((x) => x.leagues.includes(league) && x.re.test(text)) : null;
  if (lg) return { label: lg.label, reason: lg.reason };
  const hit = NOT_TRACKABLE.find((x) => x.re.test(text));
  return hit ? { label: hit.label, reason: hit.reason } : null;
}

/** Friendly version of a slip's own words: "2-pt att" stays "2-pt att", "PTS+REB" → "Pts+Reb". */
export function friendlyStat(raw: string): string {
  const t = raw.replace(/\s+/g, " ").trim();
  if (!t) return t;
  if (t === t.toUpperCase() && /[A-Z]{4,}/.test(t)) return t.toLowerCase().replace(/(^|[\s+/])([a-z])/g, (_, p, c) => p + c.toUpperCase());
  return t.charAt(0).toUpperCase() + t.slice(1);
}
