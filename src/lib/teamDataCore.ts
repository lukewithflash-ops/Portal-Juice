/**
 * VIP Data: team records straight-up, against the spread and over/under from real ESPN finals
 * plus DraftKings closing lines (ESPN odds feed, provider 100). Pure functions only (tested).
 * Games without a DraftKings close are kept for straight-up records but excluded from ATS/O-U.
 */

export type TdLeague = "nfl" | "ncaaf" | "nba" | "nhl" | "mlb";

export type TdSeason = { key: string; label: string; start: string; end: string; weeks?: { type: number; weeks: number } };
export type TdLeagueCfg = { id: TdLeague; label: string; sport: string; slug: string; periods: number; lastLabel: string; seasons: TdSeason[]; restMode: "days" | "week"; groups?: string };

/** Seasons covered. Dates are ESPN's game dates (YYYYMMDD). Football walks weeks; others walk days. */
export const TD_LEAGUES: TdLeagueCfg[] = [
  { id: "nfl", label: "NFL", sport: "football", slug: "nfl", periods: 4, lastLabel: "4th quarter", restMode: "week", seasons: [{ key: "2026", label: "2026", start: "20260909", end: "20270215", weeks: { type: 2, weeks: 18 } }] },
  { id: "nba", label: "NBA", sport: "basketball", slug: "nba", periods: 4, lastLabel: "4th quarter", restMode: "days", seasons: [
    { key: "2027", label: "2026-27", start: "20261020", end: "20270620" },
    { key: "2026", label: "2025-26", start: "20251021", end: "20260620" },
  ] },
  { id: "ncaaf", label: "NCAAF", sport: "football", slug: "college-football", periods: 4, lastLabel: "4th quarter", restMode: "week", groups: "80", seasons: [{ key: "2026", label: "2026", start: "20260822", end: "20270120", weeks: { type: 2, weeks: 16 } }] },
  { id: "nhl", label: "NHL", sport: "hockey", slug: "nhl", periods: 3, lastLabel: "3rd period", restMode: "days", seasons: [
    { key: "2027", label: "2026-27", start: "20261006", end: "20270620" },
    { key: "2026", label: "2025-26", start: "20251007", end: "20260620" },
  ] },
  { id: "mlb", label: "MLB", sport: "baseball", slug: "mlb", periods: 9, lastLabel: "7th-9th innings", restMode: "days", seasons: [{ key: "2026", label: "2026", start: "20260325", end: "20261105" }] },
];

export const tdLeague = (id: string) => TD_LEAGUES.find((l) => l.id === id) ?? null;

/** One final. sp = home closing spread (negative = home favored). All lines DraftKings close. */
export type TdGame = {
  id: string;
  d: string; // ISO start
  h: string;
  a: string;
  hs: number;
  as: number;
  hq: number[];
  aq: number[];
  conf?: boolean;
  neutral?: boolean;
  sp?: number | null;
  tot?: number | null;
  mlh?: number | null;
  mla?: number | null;
  osp?: number | null;
  otot?: number | null;
};

export type Rec = { n: number; w: number; l: number; t: number; ats: [number, number, number]; atsN: number; ou: [number, number, number]; ouN: number; margin: number };
const emptyRec = (): Rec => ({ n: 0, w: 0, l: 0, t: 0, ats: [0, 0, 0], atsN: 0, ou: [0, 0, 0], ouN: 0, margin: 0 });

export type TeamGame = {
  id: string;
  d: string;
  home: boolean;
  opp: string;
  pf: number;
  pa: number;
  q: number[];
  oq: number[];
  conf?: boolean;
  div?: boolean;
  /** team's spread (negative = favored). */
  sp: number | null;
  tot: number | null;
  ml: number | null;
  restDays: number | null;
  prev: "W" | "L" | "T" | null;
};

export function teamGames(games: TdGame[], team: string, divOf?: (abbr: string) => string | null): TeamGame[] {
  const mine = games.filter((g) => g.h === team || g.a === team).sort((x, y) => x.d.localeCompare(y.d));
  const out: TeamGame[] = [];
  for (const g of mine) {
    const home = g.h === team;
    const pf = home ? g.hs : g.as;
    const pa = home ? g.as : g.hs;
    const last = out[out.length - 1];
    const opp = home ? g.a : g.h;
    const dv = divOf ? divOf(team) : null;
    out.push({
      id: g.id,
      d: g.d,
      home,
      opp,
      pf,
      pa,
      q: home ? g.hq : g.aq,
      oq: home ? g.aq : g.hq,
      conf: g.conf,
      div: dv ? dv === divOf!(opp) : undefined,
      sp: g.sp == null ? null : home ? g.sp : -g.sp,
      tot: g.tot ?? null,
      ml: (home ? g.mlh : g.mla) ?? null,
      restDays: last ? Math.round((dayNum(g.d) - dayNum(last.d))) : null,
      prev: last ? (last.pf > last.pa ? "W" : last.pf < last.pa ? "L" : "T") : null,
    });
  }
  return out;
}

const F_DAY = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit" });
const F_HOUR = new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", hour: "numeric", hour12: false });
const F_WD = new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", weekday: "short" });
const F_MO = new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", month: "short" });
const memo = new Map<string, { day: number; hour: number; wd: string; mo: string }>();
function pt(iso: string) {
  let v = memo.get(iso);
  if (!v) {
    const dt = new Date(iso);
    v = { day: Date.parse(F_DAY.format(dt) + "T00:00:00Z") / 86400000, hour: Number(F_HOUR.format(dt)) % 24, wd: F_WD.format(dt), mo: F_MO.format(dt) };
    if (memo.size > 50_000) memo.clear();
    memo.set(iso, v);
  }
  return v;
}
/** Calendar day in Pacific time (days since epoch). */
const dayNum = (iso: string) => pt(iso).day;
const ptParts = (iso: string) => pt(iso);

export function add(r: Rec, g: TeamGame) {
  r.n++;
  if (g.pf > g.pa) r.w++;
  else if (g.pf < g.pa) r.l++;
  else r.t++;
  r.margin += g.pf - g.pa;
  if (g.sp != null) {
    const c = g.pf - g.pa + g.sp;
    r.ats[c > 0 ? 0 : c < 0 ? 1 : 2]++;
    r.atsN++;
  }
  if (g.tot != null) {
    const c = g.pf + g.pa - g.tot;
    r.ou[c > 0 ? 0 : c < 0 ? 1 : 2]++;
    r.ouN++;
  }
}

export function rec(gs: TeamGame[]): Rec {
  const r = emptyRec();
  gs.forEach((g) => add(r, g));
  return r;
}

export function slotOf(cfg: Pick<TdLeagueCfg, "id">, iso: string): string {
  const { hour, wd } = ptParts(iso);
  if (cfg.id === "nfl" || cfg.id === "ncaaf") {
    if (hour >= 16) return "Primetime";
    if (hour >= 12) return "Late afternoon";
    return "Early";
  }
  if (wd === "Sat" || wd === "Sun") return hour < 15 ? "Weekend day" : "Weekend night";
  return hour < 15 ? "Weekday day" : "Weekday night";
}

export function restOf(cfg: Pick<TdLeagueCfg, "restMode">, d: number | null): string | null {
  if (d == null) return null;
  if (cfg.restMode === "week") return d <= 5 ? "Short week" : d >= 10 ? "Off a bye" : "Normal week";
  if (d <= 1) return "Back-to-back";
  if (d === 2) return "1 day rest";
  return "2+ days rest";
}

export type Split = { key: string; group: string; label: string; r: Rec };

export function splits(cfg: TdLeagueCfg, gs: TeamGame[]): Split[] {
  const out: Split[] = [];
  const put = (group: string, label: string, pick: (g: TeamGame) => boolean) => {
    const sub = gs.filter(pick);
    if (sub.length) out.push({ key: `${group}:${label}`, group, label, r: rec(sub) });
  };
  put("Venue", "Home", (g) => g.home);
  put("Venue", "Away", (g) => !g.home);
  put("Line", "Favorite", (g) => g.sp != null && g.sp < 0);
  put("Line", "Underdog", (g) => g.sp != null && g.sp > 0);
  put("Last game", "After a win", (g) => g.prev === "W");
  put("Last game", "After a loss", (g) => g.prev === "L");
  for (const lab of ["Back-to-back", "1 day rest", "2+ days rest", "Short week", "Normal week", "Off a bye"]) put("Rest", lab, (g) => restOf(cfg, g.restDays) === lab);
  for (const wd of ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]) put("Day", wd, (g) => ptParts(g.d).wd === wd);
  for (const s of ["Early", "Late afternoon", "Primetime", "Weekday day", "Weekday night", "Weekend day", "Weekend night"]) put("Time slot (PT)", s, (g) => slotOf(cfg, g.d) === s);
  if (gs.some((g) => g.div != null)) {
    put("Opponent", "Division games", (g) => g.div === true);
    put("Opponent", "Non-division", (g) => g.div === false);
  }
  if (gs.some((g) => g.conf != null)) {
    put("Opponent", "Conference games", (g) => g.conf === true);
    put("Opponent", "Non-conference", (g) => g.conf === false);
  }
  const months = [...new Set(gs.map((g) => ptParts(g.d).mo))];
  for (const m of months) put("Month", m, (g) => ptParts(g.d).mo === m);
  return out;
}

/** Period scoring: first half, second half, final regulation period(s). Only games with full linescores. */
export type Periods = { n: number; h1: number; h2: number; last: number; lastWon: number };
export function periods(cfg: TdLeagueCfg, gs: TeamGame[]): Periods {
  const P = cfg.periods;
  const half = Math.ceil(P / 2);
  const lastIdx = cfg.id === "mlb" ? [6, 7, 8] : [P - 1];
  const ok = gs.filter((g) => g.q.length >= P && g.oq.length >= P - (cfg.id === "mlb" ? 1 : 0));
  const sum = (a: number[], idx: number[]) => idx.reduce((s, i) => s + (a[i] ?? 0), 0);
  const range = (a: number, b: number) => Array.from({ length: b - a }, (_, i) => a + i);
  let h1 = 0, h2 = 0, last = 0, lastWon = 0;
  for (const g of ok) {
    h1 += sum(g.q, range(0, half)) - sum(g.oq, range(0, half));
    h2 += sum(g.q, range(half, P)) - sum(g.oq, range(half, P));
    const l = sum(g.q, lastIdx) - sum(g.oq, lastIdx);
    last += l;
    if (l > 0) lastWon++;
  }
  const n = ok.length;
  return { n, h1: n ? h1 / n : 0, h2: n ? h2 / n : 0, last: n ? last / n : 0, lastWon };
}

export const pct = (a: number, n: number) => (n ? Math.round((100 * a) / n) : 0);
export const fmtRec = (r: Rec) => `${r.w}-${r.l}${r.t ? `-${r.t}` : ""}`;
export const fmtAts = (r: Rec) => `${r.ats[0]}-${r.ats[1]}${r.ats[2] ? `-${r.ats[2]}` : ""}`;
export const fmtOu = (r: Rec) => `${r.ou[0]}-${r.ou[1]}${r.ou[2] ? `-${r.ou[2]}` : ""}`;
const one = (x: number) => (Math.round(x * 10) / 10).toFixed(1);
const signed = (x: number) => (x > 0 ? `+${one(x)}` : one(x));

export type TeamSummary = {
  team: string;
  all: Rec;
  last10: Rec;
  splits: Split[];
  per: Periods;
  per10: Periods;
  reasons: string[];
  recent: TeamGame[];
};

/** Plain-number reasons. Every sentence restates a computed record; nothing predictive. */
export function reasons(cfg: TdLeagueCfg, s: Omit<TeamSummary, "reasons">, min = 4): string[] {
  const out: { score: number; text: string }[] = [];
  const ptsWord = cfg.id === "nhl" ? "goals" : cfg.id === "mlb" ? "runs" : "pts";
  for (const sp of s.splits) {
    const r = sp.r;
    if (r.atsN >= min) {
      const p = pct(r.ats[0], r.ats[0] + r.ats[1]);
      if (p >= 65 || p <= 35)
        out.push({ score: Math.abs(p - 50) * Math.sqrt(r.atsN), text: `${p >= 65 ? "Covered" : "Failed to cover"} in ${p >= 65 ? r.ats[0] : r.ats[1]} of ${r.atsN} games (${/^[A-Z][a-z]{2}$/.test(sp.label) ? `${sp.label} games` : sp.label}), ATS ${fmtAts(r)}.` });
    }
    if (r.n >= min) {
      const p = pct(r.w, r.n);
      if (p >= 70 || p <= 30)
        out.push({ score: Math.abs(p - 50) * Math.sqrt(r.n) * 0.6, text: `${fmtRec(r)} straight up (${/^[A-Z][a-z]{2}$/.test(sp.label) ? `${sp.label} games` : sp.label}), average margin ${signed(r.margin / r.n)} ${ptsWord}.` });
    }
    if (r.ouN >= min) {
      const p = pct(r.ou[0], r.ou[0] + r.ou[1]);
      if (p >= 70 || p <= 30) out.push({ score: Math.abs(p - 50) * Math.sqrt(r.ouN) * 0.8, text: `${p >= 70 ? "Over" : "Under"} hit in ${p >= 70 ? r.ou[0] : r.ou[1]} of ${r.ouN} (${/^[A-Z][a-z]{2}$/.test(sp.label) ? `${sp.label} games` : sp.label}), O/U ${fmtOu(r)}.` });
    }
  }
  const lastName = cfg.lastLabel;
  if (s.per10.n >= min && Math.abs(s.per10.last) >= (cfg.id === "nba" ? 2 : cfg.id === "nfl" || cfg.id === "ncaaf" ? 2 : 0.3))
    out.push({ score: 60, text: `${s.per10.last > 0 ? "Outscored" : "Was outscored by"} opponents by ${one(Math.abs(s.per10.last))} ${ptsWord} per game in the ${lastName} over the last ${s.per10.n}.` });
  if (s.per.n >= min && Math.abs(s.per.h2 - s.per.h1) >= (cfg.id === "nhl" || cfg.id === "mlb" ? 0.4 : 3))
    out.push({ score: 50, text: `Averages ${signed(s.per.h1)} ${ptsWord} in the first half and ${signed(s.per.h2)} in the second half (${s.per.n} games).` });
  // Same games under two labels (e.g. every game was a favorite and a conference game): keep one.
  const seen = new Set<string>();
  return out
    .sort((a, b) => b.score - a.score)
    .filter((x) => {
      const k = x.text.replace(/\(.*?\)/, "");
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .slice(0, 5)
    .map((x) => x.text);
}

export function summarize(cfg: TdLeagueCfg, games: TdGame[], team: string, divOf?: (a: string) => string | null): TeamSummary {
  const gs = teamGames(games, team, divOf);
  const l10 = gs.slice(-10);
  const base = { team, all: rec(gs), last10: rec(l10), splits: splits(cfg, gs), per: periods(cfg, gs), per10: periods(cfg, l10), recent: gs.slice(-10).reverse() };
  return { ...base, reasons: reasons(cfg, base) };
}

export type Board = { id: string; title: string; unit: string; rows: { team: string; value: string; sample: string; sort: number }[] };

export function boards(cfg: TdLeagueCfg, sums: TeamSummary[], min = 4): Board[] {
  const get = (r: Rec | undefined) => r ?? emptyRec();
  const split = (s: TeamSummary, label: string) => s.splits.find((x) => x.label === label)?.r;
  const mk = (id: string, title: string, unit: string, f: (s: TeamSummary) => { sort: number; value: string; sample: string; n: number } | null, asc = false): Board => ({
    id,
    title,
    unit,
    rows: sums
      .map((s) => ({ team: s.team, x: f(s) }))
      .filter((r) => r.x && r.x.n >= min)
      .map((r) => ({ team: r.team, value: r.x!.value, sample: r.x!.sample, sort: r.x!.sort }))
      .sort((a, b) => (asc ? a.sort - b.sort : b.sort - a.sort))
      .slice(0, 8),
  });
  const atsP = (r: Rec) => (r.ats[0] + r.ats[1] ? r.ats[0] / (r.ats[0] + r.ats[1]) : 0);
  const ouP = (r: Rec) => (r.ou[0] + r.ou[1] ? r.ou[0] / (r.ou[0] + r.ou[1]) : 0);
  const atsRow = (r: Rec) => ({ sort: atsP(r) * 1000 + r.atsN, value: `${fmtAts(r)} ATS`, sample: `${r.atsN} lines`, n: r.atsN });
  return [
    mk("hot", "Hottest ATS, last 10", "ATS", (s) => atsRow(s.last10)),
    mk("ats", "Best ATS, season", "ATS", (s) => atsRow(s.all)),
    mk("cold", "Coldest ATS, season", "ATS", (s) => ({ ...atsRow(s.all), sort: -atsP(s.all) * 1000 + s.all.atsN })),
    mk("home", "Best home teams", "SU", (s) => { const r = get(split(s, "Home")); return { sort: (r.n ? r.w / r.n : 0) * 1000 + r.margin / Math.max(1, r.n), value: `${fmtRec(r)} home`, sample: `${r.n} games, ${signed(r.n ? r.margin / r.n : 0)} avg`, n: r.n }; }),
    mk("road", "Best road ATS", "ATS", (s) => atsRow(get(split(s, "Away")))),
    mk("dog", "Best as underdog ATS", "ATS", (s) => atsRow(get(split(s, "Underdog")))),
    mk("over", "Overs", "O/U", (s) => ({ sort: ouP(s.all) * 1000 + s.all.ouN, value: `${fmtOu(s.all)} O/U`, sample: `${s.all.ouN} totals`, n: s.all.ouN })),
    mk("under", "Unders", "O/U", (s) => ({ sort: (1 - ouP(s.all)) * 1000 + s.all.ouN, value: `${fmtOu(s.all)} O/U`, sample: `${s.all.ouN} totals`, n: s.all.ouN })),
    mk("late", `Best ${cfg.lastLabel} margin`, "margin", (s) => ({ sort: s.per.last, value: `${signed(s.per.last)} per game`, sample: `${s.per.n} games`, n: s.per.n })),
    mk("first", "Best first-half margin", "margin", (s) => ({ sort: s.per.h1, value: `${signed(s.per.h1)} per game`, sample: `${s.per.n} games`, n: s.per.n })),
  ].filter((b) => b.rows.length);
}

/* ---------- ESPN parsing ---------- */

type Any = Record<string, unknown>;
const num = (x: unknown): number | null => {
  if (x == null || x === "") return null;
  const n = typeof x === "number" ? x : Number(String(x).replace("−", "-").replace(/^\+/, ""));
  return Number.isFinite(n) ? n : null;
};

/** Finals from an ESPN scoreboard response (no lines yet). */
export function parseFinals(data: unknown): (TdGame & { final: boolean })[] {
  const evs = ((data as Any)?.events as Any[]) ?? [];
  const out: (TdGame & { final: boolean })[] = [];
  for (const e of evs) {
    const c = ((e.competitions as Any[]) ?? [])[0];
    if (!c) continue;
    const st = ((c.status as Any)?.type as Any) ?? ((e.status as Any)?.type as Any);
    const comps = (c.competitors as Any[]) ?? [];
    const h = comps.find((x) => x.homeAway === "home");
    const a = comps.find((x) => x.homeAway === "away");
    if (!h || !a) continue;
    const ls = (x: Any) => ((x.linescores as Any[]) ?? []).map((l) => num(l.value) ?? 0);
    const hs = num(h.score);
    const as = num(a.score);
    out.push({
      id: String(e.id),
      d: String(e.date),
      h: String((h.team as Any).abbreviation),
      a: String((a.team as Any).abbreviation),
      hs: hs ?? 0,
      as: as ?? 0,
      hq: ls(h),
      aq: ls(a),
      conf: typeof c.conferenceCompetition === "boolean" ? (c.conferenceCompetition as boolean) : undefined,
      neutral: c.neutralSite === true || undefined,
      final: st?.completed === true && hs != null && as != null && st?.name !== "STATUS_CANCELED" && st?.name !== "STATUS_POSTPONED",
    });
  }
  return out;
}

export type DkLine = { sp: number | null; tot: number | null; mlh: number | null; mla: number | null; osp: number | null; otot: number | null; cur?: { sp: number | null; tot: number | null; mlh: number | null; mla: number | null } };

/** DraftKings (provider 100) lines from the ESPN core odds feed. Null when DraftKings has no line. */
export function parseDkOdds(data: unknown): DkLine | null {
  const items = ((data as Any)?.items as Any[]) ?? [];
  const dk = items.find((i) => String((i.provider as Any)?.id) === "100" || /draftkings/i.test(String((i.provider as Any)?.name)));
  if (!dk) return null;
  const ho = (dk.homeTeamOdds as Any) ?? {};
  const ao = (dk.awayTeamOdds as Any) ?? {};
  const g = (o: Any, phase: string, k: string) => num(((((o[phase] as Any) ?? {})[k] as Any) ?? {}).american);
  const tot = (phase: string) => num(((((dk[phase] as Any) ?? {}).total as Any) ?? {}).american);
  const closeSp = g(ho, "close", "pointSpread") ?? num(dk.spread);
  return {
    sp: closeSp,
    tot: tot("close") ?? num(dk.overUnder),
    mlh: g(ho, "close", "moneyLine") ?? num(ho.moneyLine),
    mla: g(ao, "close", "moneyLine") ?? num(ao.moneyLine),
    osp: g(ho, "open", "pointSpread"),
    otot: tot("open"),
    cur: { sp: g(ho, "current", "pointSpread") ?? closeSp, tot: tot("current") ?? num(dk.overUnder), mlh: g(ho, "current", "moneyLine") ?? num(ho.moneyLine), mla: g(ao, "current", "moneyLine") ?? num(ao.moneyLine) },
  };
}

/* ---------- DraftKings Network public betting splits ---------- */

export type DkSplitRow = { side: string; odds: string; handle: number; bets: number };
export type DkSplitEvent = { title: string; away: string; home: string; awayAbbr: string | null; homeAbbr: string | null; when: string; markets: { name: string; rows: DkSplitRow[] }[] };

const strip = (s: string) => s.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&#0?38;/g, "&").replace(/\s+/g, " ").trim();

/** Parse dknetwork.draftkings.com betting-splits HTML (bets % and handle % per side). */
export function parseDkSplits(html: string): DkSplitEvent[] {
  const out: DkSplitEvent[] = [];
  const blocks = html.split(/class="tb-se\s/).slice(1);
  for (const b of blocks) {
    const tm = b.match(/<h5[^>]*tb-se-title-new[^>]*>([\s\S]*?)<\/h5>/);
    if (!tm) continue;
    const title = strip(tm[1]);
    const logos = [...tm[1].matchAll(/logos\/teams\/[a-z0-9-]+\/([A-Za-z0-9]+)\.png/g)].map((m) => m[1].toUpperCase());
    const [away, home] = title.split(" @ ").map((s) => s.trim());
    if (!home) continue;
    const when = strip((b.match(/<\/h5>\s*<span[^>]*>([\s\S]*?)<\/span>/) ?? [])[1] ?? "");
    const markets: DkSplitEvent["markets"] = [];
    const mparts = b.split(/class="tb-se-head/).slice(1);
    for (const m of mparts) {
      const name = strip((m.match(/<div class="flex-1">([^<]+)<\/div>/) ?? [])[1] ?? "");
      const rows: DkSplitRow[] = [];
      for (const r of m.split(/class="tb-sodd/).slice(1)) {
        const side = strip((r.match(/tb-slipline[^>]*>([\s\S]*?)<\/div>/) ?? [])[1] ?? "");
        const odds = strip((r.match(/tb-odd-s[^>]*>([\s\S]*?)<\/a>/) ?? [])[1] ?? "").replace("−", "-");
        const p = [...r.matchAll(/<div class="flex-1">\s*(\d{1,3})%/g)].map((x) => Number(x[1]));
        if (side && p.length >= 2) rows.push({ side, odds, handle: p[0], bets: p[1] });
      }
      if (name && rows.length) markets.push({ name, rows });
    }
    out.push({ title, away, home, awayAbbr: logos[0] ?? null, homeAbbr: logos[1] ?? null, when, markets });
  }
  return out;
}
