/**
 * Pick breakdown. Pure rules over real numbers gathered from ESPN.
 * Every pro and con quotes the numbers it came from. No invented text, no money wording.
 */

import { implied } from "@/lib/odds";

export type LegKind = "spread" | "total" | "moneyline" | "prop";

export type LegInput = {
  league: string;
  gameId: string;
  kind: LegKind;
  /** spread / moneyline */
  side?: "home" | "away";
  /** total / prop */
  pick?: "over" | "under";
  line?: number | null;
  /** American odds the user has, or the posted price. */
  odds?: number | null;
  athleteId?: string;
  athleteName?: string;
  /** Stat key from STAT_OPTIONS. */
  stat?: string;
  /** Posted opening line for a prop, when ESPN sent one. */
  openLine?: number | null;
  /** Free text from a logged pick or posted row; the server matches it to a stat. */
  market?: string;
  /** Team name or abbreviation from a logged pick; the server matches it to a side. */
  team?: string;
};

export type Ranked = { value: number; rank: number; of: number };

export type FormGame = { id?: string; result: "W" | "L" | "T"; pf: number; pa: number; opp: string };

export type TeamResearch = {
  id: string;
  abbr: string;
  logo?: string | null;
  name: string;
  record: string | null;
  form: FormGame[];
  ats: string | null;
  ppg: Ranked | null;
  papg: Ranked | null;
  /** NFL only: per game, rank 1 = fewest allowed. */
  passAllowed: Ranked | null;
  rushAllowed: Ranked | null;
  /** MLB only. */
  batting: { avg: string | null; ops: string | null; runsPerGame: number | null; games: number | null } | null;
  injuries: { name: string; status: string }[];
};

export type PitcherResearch = {
  id: string;
  name: string;
  hand: string | null;
  era: number | null;
  eraRank: string | null;
  whip: number | null;
  k: number | null;
  record: string | null;
  recent: { date: string; ip: number; er: number; k: number; opp: string }[];
};

export type PlayerGame = { date: string; value: number; home: boolean; opp: string };

export type PlayerResearch = {
  id: string;
  name: string;
  headshot?: string | null;
  team: string;
  teamId: string | null;
  position: string | null;
  statLabel: string;
  /** Newest first. Regular season and postseason only. */
  games: PlayerGame[];
};

export type GameResearch = {
  league: string;
  id: string;
  label: string;
  start: string;
  state: "pre" | "in" | "post";
  venue: string | null;
  weather: string | null;
  indoor: boolean | null;
  odds: {
    provider: string;
    spreadHome: number | null;
    spreadHomeOpen: number | null;
    total: number | null;
    totalOpen: number | null;
    homeMl: number | null;
    awayMl: number | null;
    homeMlOpen: number | null;
    awayMlOpen: number | null;
    overJuice: number | null;
    underJuice: number | null;
    homeSpreadJuice: number | null;
    awaySpreadJuice: number | null;
  } | null;
  home: TeamResearch;
  away: TeamResearch;
  pitchers: { home: PitcherResearch | null; away: PitcherResearch | null } | null;
};

export type Fact = { label: string; value: string };
export type Point = { text: string; weight: number };
export type Lean = "strong" | "good" | "neutral" | "bad" | "none";

export type LegReport = {
  title: string;
  sub: string;
  league: string;
  gameId: string;
  sameGameKey: string;
  facts: Fact[];
  pros: Point[];
  cons: Point[];
  score: number;
  lean: Lean;
  /** 0–1 from the price, when there is one. */
  implied: number | null;
  odds: number | null;
  /** Face or logo for the row. */
  mark?: { abbr: string; img: string | null; logo: boolean };
};

export const LEAN_NOTE = "Ranked by the numbers. Not a guarantee.";

export const STAT_OPTIONS: Record<string, { key: string; label: string }[]> = {
  nba: [
    { key: "points", label: "Points" },
    { key: "totalRebounds", label: "Rebounds" },
    { key: "assists", label: "Assists" },
    { key: "threePointFieldGoalsMade", label: "3-pointers made" },
    { key: "pra", label: "Pts + Reb + Ast" },
    { key: "steals", label: "Steals" },
    { key: "blocks", label: "Blocks" },
  ],
  nfl: [
    { key: "passingYards", label: "Passing yards" },
    { key: "rushingYards", label: "Rushing yards" },
    { key: "receivingYards", label: "Receiving yards" },
    { key: "receptions", label: "Receptions" },
    { key: "completions", label: "Pass completions" },
    { key: "passingTouchdowns", label: "Passing TDs" },
  ],
  nhl: [
    { key: "goals", label: "Goals" },
    { key: "assists", label: "Assists" },
    { key: "points", label: "Points" },
    { key: "shotsTotal", label: "Shots" },
  ],
  mlb: [
    { key: "strikeouts", label: "Strikeouts" },
    { key: "earnedRuns", label: "Earned runs allowed" },
    { key: "hits", label: "Hits" },
    { key: "homeRuns", label: "Home runs" },
    { key: "RBIs", label: "RBIs" },
  ],
};
STAT_OPTIONS.ncaaf = STAT_OPTIONS.nfl;

export function statLabel(league: string, key: string | undefined): string {
  return STAT_OPTIONS[league]?.find((s) => s.key === key)?.label ?? key ?? "Stat";
}

/** Map an ESPN prop market name to a stat key. */
export function statFromMarket(league: string, market: string): string | null {
  const m = market.toLowerCase();
  if (/points.*rebounds.*assists|pts.*reb.*ast|\bpra\b/.test(m)) return "pra";
  // Combos, longest plays, and fantasy scores have no single game-log stat.
  if (/\+|longest|fantasy|target|attempt|carries/.test(m)) return null;
  if (/earned run/.test(m)) return "earnedRuns";
  if (/steal/.test(m)) return "steals";
  if (/block/.test(m)) return "blocks";
  if (/pass.*(td|touchdown)/.test(m)) return "passingTouchdowns";
  if (/three|3-point|3pt/.test(m)) return "threePointFieldGoalsMade";
  if (/pass.*yard/.test(m)) return "passingYards";
  if (/rush.*yard/.test(m)) return "rushingYards";
  if (/receiv.*yard/.test(m)) return "receivingYards";
  if (/reception/.test(m)) return "receptions";
  if (/completion/.test(m)) return "completions";
  if (/strikeout/.test(m)) return "strikeouts";
  if (/home run/.test(m)) return "homeRuns";
  if (/rbi/.test(m)) return "RBIs";
  if (/shots/.test(m)) return "shotsTotal";
  if (/rebound/.test(m)) return "totalRebounds";
  if (/assist/.test(m)) return "assists";
  if (/goal/.test(m) && league === "nhl") return "goals";
  if (/hits/.test(m)) return "hits";
  if (/point/.test(m)) return "points";
  return null;
}

const r1 = (n: number) => Math.round(n * 10) / 10;
const pct = (n: number) => `${Math.round(n * 100)}%`;
const fmtLine = (n: number) => (n > 0 ? `+${n}` : `${n}`);
const fmtOdds = (n: number) => (n > 0 ? `+${n}` : `${n}`);
const ord = (n: number) => {
  const t = n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] ?? "th";
  return `${n}${t}`;
};

export function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export function hitCount(values: number[], line: number, pick: "over" | "under") {
  let hit = 0;
  let push = 0;
  for (const v of values) {
    if (v === line) push++;
    else if (pick === "over" ? v > line : v < line) hit++;
  }
  return { hit, push, n: values.length };
}

/** "3-2-0" or "3-2" → wins and losses. */
export function parseRecord(s: string | null): { w: number; l: number } | null {
  if (!s) return null;
  const m = /^(\d+)-(\d+)/.exec(s.trim());
  return m ? { w: Number(m[1]), l: Number(m[2]) } : null;
}

/** Highest wind in mph from a weather line, if posted. */
export function windMph(weather: string | null): number | null {
  if (!weather) return null;
  const ms = [...weather.matchAll(/(?:wind|gust)[^\d]{0,12}(\d+)/gi)].map((m) => Number(m[1]));
  return ms.length ? Math.max(...ms) : null;
}

function leanOf(score: number, pros: Point[], cons: Point[]): Lean {
  if (pros.length + cons.length < 2) return "none";
  if (score >= 3 && pros.length >= 3) return "strong";
  if (score >= 1) return "good";
  if (score <= -1) return "bad";
  return "neutral";
}

function sideOf(g: GameResearch, side: "home" | "away") {
  return side === "home" ? { me: g.home, opp: g.away } : { me: g.away, opp: g.home };
}

function formFacts(t: TeamResearch, facts: Fact[]) {
  if (t.form.length) {
    const w = t.form.filter((f) => f.result === "W").length;
    const l = t.form.filter((f) => f.result === "L").length;
    facts.push({ label: `${t.abbr} last ${t.form.length}`, value: `${w}-${l} · ${t.form.map((f) => `${f.result} ${f.pf}-${f.pa}`).join(", ")}` });
  }
  if (t.ppg) facts.push({ label: `${t.abbr} scoring`, value: `${t.ppg.value} per game (${ord(t.ppg.rank)} of ${t.ppg.of})` });
  if (t.papg) facts.push({ label: `${t.abbr} allowed`, value: `${t.papg.value} per game (${ord(t.papg.rank)} fewest of ${t.papg.of})` });
  if (t.ats) facts.push({ label: `${t.abbr} vs spread`, value: `${t.ats} (ESPN)` });
}

function injuryPoints(me: TeamResearch, opp: TeamResearch, pros: Point[], cons: Point[], facts: Fact[]) {
  const out = (t: TeamResearch) => t.injuries.filter((i) => /^out$|injured reserve|^ir$/i.test(i.status));
  const mine = out(me);
  const theirs = out(opp);
  if (me.injuries.length) facts.push({ label: `${me.abbr} injury report`, value: me.injuries.slice(0, 6).map((i) => `${i.name} (${i.status})`).join(", ") });
  if (opp.injuries.length) facts.push({ label: `${opp.abbr} injury report`, value: opp.injuries.slice(0, 6).map((i) => `${i.name} (${i.status})`).join(", ") });
  if (mine.length >= 2 && mine.length > theirs.length) cons.push({ text: `${me.abbr} has ${mine.length} players listed Out vs ${theirs.length} for ${opp.abbr}`, weight: -1 });
  if (theirs.length >= 2 && theirs.length > mine.length) pros.push({ text: `${opp.abbr} has ${theirs.length} players listed Out vs ${mine.length} for ${me.abbr}`, weight: 1 });
}

function pitcherPoints(g: GameResearch, side: "home" | "away", pros: Point[], cons: Point[], facts: Fact[]) {
  if (!g.pitchers) return;
  const mine = g.pitchers[side];
  const theirs = g.pitchers[side === "home" ? "away" : "home"];
  for (const p of [g.pitchers.away, g.pitchers.home]) {
    if (!p) continue;
    const recent = recentEra(p);
    facts.push({
      label: `SP ${p.name}${p.hand ? ` (${p.hand})` : ""}`,
      value: [
        p.era !== null ? `ERA ${p.era.toFixed(2)}${p.eraRank ? ` (${p.eraRank})` : ""}` : null,
        p.whip !== null ? `WHIP ${p.whip.toFixed(2)}` : null,
        p.k !== null ? `${p.k} K` : null,
        p.record ? `${p.record}` : null,
        recent ? `last ${recent.starts} starts ${recent.era.toFixed(2)} ERA, ${recent.k} K in ${recent.ip} IP` : null,
      ]
        .filter(Boolean)
        .join(" · ") || "No season line posted",
    });
  }
  if (mine?.era != null && theirs?.era != null) {
    const gap = r1(theirs.era - mine.era);
    if (gap >= 0.75) pros.push({ text: `Starter gap: ${mine.name} ${mine.era.toFixed(2)} ERA vs ${theirs.name} ${theirs.era.toFixed(2)}`, weight: 2 });
    else if (gap <= -0.75) cons.push({ text: `Starter gap: ${mine.name} ${mine.era.toFixed(2)} ERA vs ${theirs.name} ${theirs.era.toFixed(2)}`, weight: -2 });
  } else if (!mine || !theirs) {
    facts.push({ label: "Starters", value: "Not posted by ESPN yet" });
  }
}

/** 37 outs → "12.1" the way box scores write innings. */
export function ipText(outs: number): string {
  return `${Math.floor(outs / 3)}.${outs % 3}`;
}

export function recentEra(p: PitcherResearch): { era: number; ip: string; k: number; starts: number } | null {
  const rows = p.recent.slice(0, 3);
  const outs = rows.reduce((s, r) => s + Math.floor(r.ip) * 3 + Math.round((r.ip % 1) * 10), 0);
  if (!rows.length || outs === 0) return null;
  const ip = outs / 3;
  const er = rows.reduce((s, r) => s + r.er, 0);
  return { era: Math.round(((er * 9) / ip) * 100) / 100, ip: ipText(outs), k: rows.reduce((s, r) => s + r.k, 0), starts: rows.length };
}

function avgMargin(t: TeamResearch): number | null {
  if (t.form.length < 3) return null;
  return r1(t.form.reduce((s, f) => s + (f.pf - f.pa), 0) / t.form.length);
}

function netRating(t: TeamResearch): number | null {
  return t.ppg && t.papg ? r1(t.ppg.value - t.papg.value) : null;
}

function finalize(base: Omit<LegReport, "score" | "lean">): LegReport {
  const score = [...base.pros, ...base.cons].reduce((s, p) => s + p.weight, 0);
  return { ...base, score, lean: leanOf(score, base.pros, base.cons) };
}

function sideLeg(input: LegInput, g: GameResearch, kind: "spread" | "moneyline"): LegReport {
  const side = input.side ?? "home";
  const { me, opp } = sideOf(g, side);
  const facts: Fact[] = [];
  const pros: Point[] = [];
  const cons: Point[] = [];
  const o = g.odds;
  const postedSpread = o?.spreadHome != null ? (side === "home" ? o.spreadHome : -o.spreadHome) : null;
  const line = kind === "spread" ? input.line ?? postedSpread : null;
  const postedOdds =
    kind === "moneyline" ? (side === "home" ? o?.homeMl : o?.awayMl) ?? null : (side === "home" ? o?.homeSpreadJuice : o?.awaySpreadJuice) ?? null;
  const odds = input.odds ?? postedOdds;

  if (o) {
    if (kind === "spread" && o.spreadHome != null) {
      const open = o.spreadHomeOpen;
      facts.push({ label: "Spread", value: `${g.home.abbr} ${fmtLine(o.spreadHome)}${open != null && open !== o.spreadHome ? ` (opened ${fmtLine(open)})` : ""} · ${o.provider}` });
      if (open != null && open !== o.spreadHome) {
        // Judged by the number you get now: a higher number for your side is better (−3 → −2.5).
        const mineNow = side === "home" ? o.spreadHome : -o.spreadHome;
        const mineOpen = side === "home" ? open : -open;
        const better = mineNow > mineOpen;
        const moved = Math.abs(r1(o.spreadHome - open));
        (better ? pros : cons).push({ text: `Spread moved ${moved} since open (${me.abbr} ${fmtLine(mineOpen)} → ${fmtLine(mineNow)}): a ${better ? "better" : "worse"} number for ${me.abbr} now`, weight: better ? 1 : -1 });
      }
    }
    const ml = side === "home" ? o.homeMl : o.awayMl;
    const mlOpen = side === "home" ? o.homeMlOpen : o.awayMlOpen;
    if (ml != null) {
      facts.push({ label: `${me.abbr} moneyline`, value: `${fmtOdds(ml)} (${pct(implied(ml))} implied)${mlOpen != null && mlOpen !== ml ? ` · opened ${fmtOdds(mlOpen)}` : ""}` });
      if (kind === "moneyline" && mlOpen != null && mlOpen !== ml) {
        const shorter = implied(ml) > implied(mlOpen);
        (shorter ? pros : cons).push({ text: `Price ${shorter ? "shortened" : "drifted"}: ${fmtOdds(mlOpen)} → ${fmtOdds(ml)} (${pct(implied(mlOpen))} → ${pct(implied(ml))} implied)`, weight: shorter ? 1 : -1 });
      }
    }
  } else {
    facts.push({ label: "Prices", value: "No line posted by ESPN" });
  }

  formFacts(me, facts);
  formFacts(opp, facts);

  const meForm = me.form.filter((f) => f.result === "W").length;
  const oppForm = opp.form.filter((f) => f.result === "W").length;
  if (me.form.length >= 4 && opp.form.length >= 4) {
    if (meForm - oppForm >= 2) pros.push({ text: `Form: ${me.abbr} ${meForm}-${me.form.length - meForm} last ${me.form.length} vs ${opp.abbr} ${oppForm}-${opp.form.length - oppForm}`, weight: 1 });
    else if (oppForm - meForm >= 2) cons.push({ text: `Form: ${me.abbr} ${meForm}-${me.form.length - meForm} last ${me.form.length} vs ${opp.abbr} ${oppForm}-${opp.form.length - oppForm}`, weight: -1 });
  }

  const nm = netRating(me);
  const no = netRating(opp);
  if (nm !== null && no !== null) {
    const gap = r1(nm - no);
    const big = g.league === "mlb" || g.league === "nhl" ? 0.5 : 3;
    if (gap >= big) pros.push({ text: `Scoring margin: ${me.abbr} ${fmtLine(nm)} per game vs ${opp.abbr} ${fmtLine(no)}`, weight: 1 });
    else if (gap <= -big) cons.push({ text: `Scoring margin: ${me.abbr} ${fmtLine(nm)} per game vs ${opp.abbr} ${fmtLine(no)}`, weight: -1 });
  }

  if (kind === "spread" && line != null) {
    const m = avgMargin(me);
    if (m !== null) {
      // Covering needs margin + line > 0.
      if (m + line >= 3) pros.push({ text: `${me.abbr} last ${me.form.length} avg margin ${fmtLine(m)} vs spread ${fmtLine(line)}`, weight: 1 });
      else if (m + line <= -3) cons.push({ text: `${me.abbr} last ${me.form.length} avg margin ${fmtLine(m)} vs spread ${fmtLine(line)}`, weight: -1 });
    }
    const ats = parseRecord(me.ats);
    if (ats && ats.w + ats.l >= 5) {
      const rate = ats.w / (ats.w + ats.l);
      if (rate >= 0.6) pros.push({ text: `${me.abbr} ${me.ats} against the spread (ESPN)`, weight: 1 });
      else if (rate <= 0.4) cons.push({ text: `${me.abbr} ${me.ats} against the spread (ESPN)`, weight: -1 });
    }
  }

  pitcherPoints(g, side, pros, cons, facts);
  injuryPoints(me, opp, pros, cons, facts);

  const title =
    kind === "spread"
      ? `${me.abbr} ${line != null ? fmtLine(line) : "spread"}`
      : `${me.abbr} moneyline`;
  return finalize({
    title,
    sub: g.label,
    league: g.league,
    gameId: g.id,
    sameGameKey: `${g.league}/${g.id}`,
    facts,
    pros,
    cons,
    implied: odds != null ? implied(odds) : null,
    odds: odds ?? null,
    mark: { abbr: me.abbr, img: me.logo ?? null, logo: true },
  });
}

function totalLeg(input: LegInput, g: GameResearch): LegReport {
  const pick = input.pick ?? "over";
  const o = g.odds;
  const line = input.line ?? o?.total ?? null;
  const facts: Fact[] = [];
  const pros: Point[] = [];
  const cons: Point[] = [];
  const odds = input.odds ?? (pick === "over" ? o?.overJuice : o?.underJuice) ?? null;
  const say = (good: boolean, text: string, w = 1) => (good ? pros : cons).push({ text, weight: good ? w : -w });

  if (o?.total != null) {
    facts.push({ label: "Total", value: `${o.total}${o.totalOpen != null && o.totalOpen !== o.total ? ` (opened ${o.totalOpen})` : ""} · ${o.provider}` });
    if (o.totalOpen != null && o.totalOpen !== o.total) {
      const up = o.total > o.totalOpen;
      const better = up === (pick === "under");
      say(better, `Total moved ${up ? "up" : "down"} ${r1(Math.abs(o.total - o.totalOpen))} since open (${o.totalOpen} → ${o.total}): a ${better ? "better" : "worse"} number for the ${pick}`);
    }
  }
  if (line == null) {
    facts.push({ label: "Total", value: "No total posted; enter one to compare" });
  } else {
    const h = g.home;
    const a = g.away;
    if (h.ppg && h.papg && a.ppg && a.papg) {
      const proj = r1((h.ppg.value + a.papg.value) / 2 + (a.ppg.value + h.papg.value) / 2);
      facts.push({ label: "Season averages", value: `${a.abbr} ${a.ppg.value} for / ${a.papg.value} against · ${h.abbr} ${h.ppg.value} for / ${h.papg.value} against → ${proj} combined (average, not a prediction)` });
      const edge = (proj - line) / line;
      if (Math.abs(edge) >= 0.03) say((edge > 0) === (pick === "over"), `Season scoring averages blend to ${proj} vs ${line}`, 1);
    }
    // Teams that just played each other share games; count each game once.
    const seen = new Set<string>();
    const totals = [...h.form, ...a.form]
      .filter((f) => !f.id || (seen.has(f.id) ? false : (seen.add(f.id), true)))
      .map((f) => f.pf + f.pa);
    if (totals.length >= 5) {
      const c = hitCount(totals, line, pick);
      facts.push({ label: "Recent game totals", value: `${totals.join(", ")} (${totals.length} recent ${a.abbr} and ${h.abbr} games)` });
      const rate = c.hit / c.n;
      if (rate >= 0.6) pros.push({ text: `${c.hit} of ${c.n} recent ${h.abbr}/${a.abbr} games went ${pick} ${line}`, weight: 1 });
      else if (rate <= 0.4) cons.push({ text: `Only ${c.hit} of ${c.n} recent ${h.abbr}/${a.abbr} games went ${pick} ${line}`, weight: -1 });
    }
    if (g.pitchers?.home?.era != null && g.pitchers?.away?.era != null) {
      const avg = r1((g.pitchers.home.era + g.pitchers.away.era) / 2);
      if (avg <= 3.25) say(pick === "under", `Both starters strong: ${g.pitchers.away.name} ${g.pitchers.away.era.toFixed(2)} and ${g.pitchers.home.name} ${g.pitchers.home.era.toFixed(2)} ERA`, 1);
      else if (avg >= 4.5) say(pick === "over", `Starters allow runs: ${g.pitchers.away.name} ${g.pitchers.away.era.toFixed(2)} and ${g.pitchers.home.name} ${g.pitchers.home.era.toFixed(2)} ERA`, 1);
    }
  }
  for (const t of [g.away, g.home]) {
    if (t.batting) {
      facts.push({ label: `${t.abbr} batting`, value: [t.batting.avg ? `AVG ${t.batting.avg}` : null, t.batting.ops ? `OPS ${t.batting.ops}` : null, t.batting.runsPerGame != null ? `${t.batting.runsPerGame} runs/game over ${t.batting.games} games` : null].filter(Boolean).join(" · ") });
    }
  }
  pitcherPoints(g, "home", [], [], facts);
  const wind = windMph(g.weather);
  if (g.weather) facts.push({ label: "Weather", value: g.weather });
  if (wind !== null && wind >= 15 && (g.league === "nfl" || g.league === "ncaaf" || g.league === "mlb") && g.indoor !== true) {
    say(pick === "under", `Wind or gusts up to ${wind} mph in the ESPN weather line`, 1);
  }
  formFacts(g.away, facts);
  formFacts(g.home, facts);
  return finalize({
    title: `${pick === "over" ? "Over" : "Under"} ${line ?? ""}`.trim(),
    sub: g.label,
    league: g.league,
    gameId: g.id,
    sameGameKey: `${g.league}/${g.id}`,
    facts,
    pros,
    cons,
    implied: odds != null ? implied(odds) : null,
    odds: odds ?? null,
    mark: { abbr: g.home.abbr, img: g.home.logo ?? null, logo: true },
  });
}

function propLeg(input: LegInput, g: GameResearch, p: PlayerResearch | null): LegReport {
  const pick = input.pick ?? "over";
  const line = input.line ?? null;
  const facts: Fact[] = [];
  const pros: Point[] = [];
  const cons: Point[] = [];
  const label = statLabel(g.league, input.stat);
  const title = `${input.athleteName ?? p?.name ?? "Player"} ${pick === "over" ? "over" : "under"} ${line ?? ""} ${label.toLowerCase()}`.replace(/\s+/g, " ").trim();
  const base = { title, sub: g.label, league: g.league, gameId: g.id, sameGameKey: `${g.league}/${g.id}`, implied: input.odds != null ? implied(input.odds) : null, odds: input.odds ?? null, mark: { abbr: p?.team ?? "", img: p?.headshot ?? null, logo: false } };
  if (!p || !p.games.length) {
    facts.push({ label: "Game log", value: "Not enough data: ESPN has no game log for this player and stat" });
    return finalize({ ...base, facts, pros, cons });
  }
  if (line == null) {
    const v = p.games.map((x) => x.value);
    facts.push({ label: `Last ${Math.min(10, v.length)}`, value: `${v.slice(0, 10).join(", ")} (newest first)` });
    facts.push({ label: "Line", value: "Add a line to get pros and cons" });
    return finalize({ ...base, facts, pros, cons });
  }
  const vals = p.games.map((x) => x.value);
  const last5 = vals.slice(0, 5);
  const last10 = vals.slice(0, 10);
  if (last5.length < 3) {
    facts.push({ label: "Game log", value: `Not enough data: ${vals.length} games logged` });
    return finalize({ ...base, facts, pros, cons });
  }
  const avg = (xs: number[]) => r1(xs.reduce((s, x) => s + x, 0) / xs.length);
  const c10 = hitCount(last10, line, pick);
  const c5 = hitCount(last5, line, pick);
  facts.push({ label: `Last ${last10.length}`, value: `${last10.join(", ")} (newest first)` });
  facts.push({ label: `Last ${last5.length} avg / median`, value: `${avg(last5)} / ${median(last5)}` });
  if (last10.length > last5.length) facts.push({ label: `Last ${last10.length} avg / median`, value: `${avg(last10)} / ${median(last10)}` });
  if (vals.length > last10.length) facts.push({ label: `Season (${vals.length} games)`, value: `${avg(vals)} avg` });
  const word = pick === "over" ? "Over" : "Under";
  const rate10 = c10.hit / c10.n;
  if (rate10 >= 0.6) pros.push({ text: `${word} ${line} in ${c10.hit} of last ${c10.n} (avg ${avg(last10)}, median ${median(last10)})`, weight: rate10 >= 0.8 ? 2 : 1 });
  else if (rate10 <= 0.4) cons.push({ text: `${word} ${line} in only ${c10.hit} of last ${c10.n} (avg ${avg(last10)}, median ${median(last10)})`, weight: rate10 <= 0.2 ? -2 : -1 });
  const gap5 = (avg(last5) - line) / Math.max(1, line);
  if (Math.abs(gap5) >= 0.1) {
    const good = (gap5 > 0) === (pick === "over");
    (good ? pros : cons).push({ text: `Last ${last5.length} avg ${avg(last5)} vs line ${line} (${c5.hit} of ${c5.n} ${word.toLowerCase()})`, weight: good ? 1 : -1 });
  }
  const season = avg(vals);
  if (vals.length >= 8 && Math.abs(season - line) / Math.max(1, line) >= 0.1) {
    const good = (season > line) === (pick === "over");
    (good ? pros : cons).push({ text: `Season avg ${season} over ${vals.length} games vs ${line}`, weight: good ? 1 : -1 });
  }
  const isHome = p.teamId ? p.teamId === g.home.id : null;
  if (isHome !== null) {
    const split = p.games.filter((x) => x.home === isHome).map((x) => x.value);
    if (split.length >= 4) {
      const sa = avg(split);
      facts.push({ label: `${isHome ? "Home" : "Road"} split`, value: `${sa} avg over ${split.length} games` });
      if (Math.abs(sa - line) / Math.max(1, line) >= 0.12) {
        const good = (sa > line) === (pick === "over");
        (good ? pros : cons).push({ text: `${isHome ? "Home" : "Road"} avg ${sa} over ${split.length} games vs ${line}`, weight: good ? 1 : -1 });
      }
    }
  }
  const opp = isHome === null ? null : isHome ? g.away : g.home;
  if (opp) {
    const key = input.stat ?? "";
    const allowed =
      /passing/i.test(key) ? { r: opp.passAllowed, what: "pass yds" } :
      /rushing/i.test(key) ? { r: opp.rushAllowed, what: "rush yds" } :
      /receiv|reception/i.test(key) ? { r: opp.passAllowed, what: "pass yds" } :
      /points|pra|goals|shots|assists|rebounds|threePoint/i.test(key) || g.league === "mlb" ? { r: opp.papg, what: g.league === "mlb" ? "runs" : g.league === "nhl" ? "goals" : "points" } :
      null;
    if (allowed?.r) {
      const { value, rank, of } = allowed.r;
      facts.push({ label: `${opp.abbr} defense`, value: `${value} ${allowed.what} allowed per game (${ord(rank)} fewest of ${of})` });
      const tough = rank <= Math.ceil(of / 4);
      const soft = rank > of - Math.ceil(of / 4);
      // Pitcher strikeouts and earned runs read the other way: the pitcher faces their offense.
      const pitcherStat = key === "strikeouts" || key === "earnedRuns";
      if (!pitcherStat && (tough || soft)) {
        const good = soft === (pick === "over");
        const where = soft ? `${ord(of - rank + 1)}-most` : `${ord(rank)}-fewest`;
        (good ? pros : cons).push({ text: `${opp.abbr} allows the ${where} ${allowed.what} (${value} per game)`, weight: good ? 1 : -1 });
      }
    }
    if (opp.batting && (input.stat === "strikeouts" || input.stat === "earnedRuns") && opp.batting.runsPerGame != null) {
      facts.push({ label: `${opp.abbr} offense`, value: `${opp.batting.runsPerGame} runs/game · AVG ${opp.batting.avg ?? "—"}` });
    }
  }
  if (input.openLine != null && input.openLine !== line) {
    const up = line > input.openLine;
    const good = up === (pick === "under");
    (good ? pros : cons).push({ text: `Line moved ${up ? "up" : "down"} from ${input.openLine} to ${line}: a ${good ? "better" : "worse"} number for the ${pick}`, weight: good ? 1 : -1 });
  }
  const team = isHome === null ? null : isHome ? g.home : g.away;
  const listed = team?.injuries.find((i) => i.name.toLowerCase() === p.name.toLowerCase());
  if (listed) cons.push({ text: `${p.name} is on the ESPN injury report (${listed.status})`, weight: /out/i.test(listed.status) ? -3 : -1 });
  return finalize({ ...base, facts, pros, cons });
}

export function analyzeLeg(input: LegInput, g: GameResearch, player: PlayerResearch | null = null): LegReport {
  if (input.kind === "prop") return propLeg(input, g, player);
  if (input.kind === "total") return totalLeg(input, g);
  return sideLeg(input, g, input.kind);
}

export type ParlayReport = {
  legs: number;
  priced: number;
  /** Product of leg implied chances, 0–1. Null if no leg has a price. */
  combined: number | null;
  sameGame: boolean;
  weakest: number | null;
  strongest: number | null;
  summary: string;
};

export function parlayMath(reports: LegReport[]): ParlayReport {
  const priced = reports.filter((r) => r.implied != null);
  const combined = priced.length ? priced.reduce((p, r) => p * (r.implied as number), 1) : null;
  const games = new Map<string, number>();
  for (const r of reports) games.set(r.sameGameKey, (games.get(r.sameGameKey) ?? 0) + 1);
  const sameGame = [...games.values()].some((n) => n > 1);
  let weakest: number | null = null;
  let strongest: number | null = null;
  if (reports.length > 1) {
    reports.forEach((r, i) => {
      if (weakest === null || r.score < reports[weakest].score) weakest = i;
      if (strongest === null || r.score > reports[strongest].score) strongest = i;
    });
    if (weakest === strongest) {
      weakest = null;
      strongest = null;
    }
  }
  const parts: string[] = [];
  parts.push(`${reports.length} leg${reports.length === 1 ? "" : "s"}.`);
  if (combined !== null) {
    parts.push(
      `Priced legs multiply to ${(combined * 100).toFixed(1)}% implied${priced.length < reports.length ? ` (${priced.length} of ${reports.length} legs have a price)` : ""}.`
    );
  } else {
    parts.push("No leg has a price, so no combined chance.");
  }
  const good = reports.filter((r) => r.lean === "good" || r.lean === "strong").length;
  const bad = reports.filter((r) => r.lean === "bad").length;
  parts.push(`${good} lean good by the numbers, ${bad} lean bad.`);
  if (sameGame) parts.push("Same-game legs are linked, so the real combined chance can differ from the product.");
  return { legs: reports.length, priced: priced.length, combined, sameGame, weakest, strongest, summary: parts.join(" ") };
}

/** Link that opens /check with legs filled in. */
export function checkHref(legs: LegInput[]): string {
  return `/check?l=${encodeURIComponent(JSON.stringify(legs.slice(0, 6)))}`;
}

/** Reads ?l= safely. Bad input gives an empty list. */
export function legsFromParam(raw: string | null): LegInput[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    if (!Array.isArray(v)) return [];
    return v
      .filter((x) => x && typeof x === "object" && typeof x.league === "string" && typeof x.gameId === "string" && ["spread", "total", "moneyline", "prop"].includes(x.kind))
      .slice(0, 6) as LegInput[];
  } catch {
    return [];
  }
}

/** Short words for a leg before it is analyzed. */
export function legLabel(l: LegInput, teams?: { home: string; away: string }): string {
  const team = l.side === "away" ? teams?.away ?? "Away" : teams?.home ?? "Home";
  const line = l.line != null ? (l.kind === "spread" ? fmtLine(l.line) : String(l.line)) : "";
  if (l.kind === "spread") return `${team} ${line || "spread"}`.trim();
  if (l.kind === "moneyline") return `${team} moneyline`;
  if (l.kind === "total") return `${l.pick === "under" ? "Under" : "Over"} ${line}`.trim();
  return `${l.athleteName ?? "Player"} ${l.pick === "under" ? "under" : "over"} ${line} ${statLabel(l.league, l.stat).toLowerCase()}`.replace(/\s+/g, " ").trim();
}

/** 0–100 for the meter. Score is clamped at ±5. */
export function leanFill(score: number): number {
  const s = Math.max(-5, Math.min(5, score));
  return Math.round(((s + 5) / 10) * 100);
}

/** A logged pick tied to a game, as a Breakdown leg. Null when it has no game. */
export function legFromLogged(p: {
  league?: string;
  gameId?: string;
  subject: string;
  market?: string;
  selection?: "Over" | "Under" | null;
  line: number;
  odds: number;
}): LegInput | null {
  if (!p.league || !p.gameId) return null;
  const m = (p.market ?? "").toLowerCase();
  const odds = Number.isFinite(p.odds) && Math.abs(p.odds) >= 100 ? p.odds : null;
  const pick = p.selection === "Under" ? "under" : "over";
  if (/spread|run line|puck line/.test(m)) return { league: p.league, gameId: p.gameId, kind: "spread", team: p.subject, line: p.line, odds };
  if (/money|^ml$|winner/.test(m)) return { league: p.league, gameId: p.gameId, kind: "moneyline", team: p.subject, odds };
  if (/^total|game total|total points|total runs|total goals/.test(m) && !statFromMarket(p.league, m.replace(/total/, "").trim() || "x"))
    return { league: p.league, gameId: p.gameId, kind: "total", pick, line: p.line, odds };
  return { league: p.league, gameId: p.gameId, kind: "prop", athleteName: p.subject, market: p.market, line: p.line, pick, odds };
}
