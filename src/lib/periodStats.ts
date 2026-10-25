/**
 * Period props ("2nd quarter receiving yards", "1st half points"): stats from ONLY that quarter or half,
 * summed from ESPN's real play-by-play. Pure. Nothing is estimated: a stat we can't attribute from the
 * plays is not supported, and the leg stays one you grade yourself.
 *
 * Football reads ESPN's core play feed (each play names its passer, rusher and receiver by athlete id).
 * Basketball reads the summary plays (shooter, assister, rebounder, blocker, stealer by athlete id).
 */

export type PeriodCode = "1Q" | "2Q" | "3Q" | "4Q" | "1H" | "2H" | "1P" | "2P" | "3P";
/** period number ("1".."4", "5" = OT) → athlete id → ESPN box keys → value. */
export type PeriodStats = Record<string, Record<string, Record<string, number>>>;

const ORD: Record<string, string> = { "1": "1st", "2": "2nd", "3": "3rd", "4": "4th" };
export const PERIOD_LABEL: Record<PeriodCode, string> = {
  "1Q": "1st quarter", "2Q": "2nd quarter", "3Q": "3rd quarter", "4Q": "4th quarter",
  "1H": "1st half", "2H": "2nd half", "1P": "1st period", "2P": "2nd period", "3P": "3rd period",
};
export const PERIOD_CODES = Object.keys(PERIOD_LABEL) as PeriodCode[];

const WORD: Record<string, string> = { first: "1", second: "2", third: "3", fourth: "4", "1st": "1", "2nd": "2", "3rd": "3", "4th": "4", one: "1", two: "2", three: "3", four: "4" };
const N = "(1st|2nd|3rd|4th|first|second|third|fourth|[1-4])";

/** Finds a period scope in slip or market text. Null = full game. */
export function periodOf(text: string | null | undefined): PeriodCode | null {
  if (!text) return null;
  const t = text.toLowerCase();
  const num = (s: string) => WORD[s] ?? s;
  let m = t.match(new RegExp(`\\b${N}\\s*(?:-|\\s)?\\s*(quarter|qtr|q|half|h|period|per)\\b`));
  if (m) {
    const n = num(m[1]);
    const u = m[2];
    if (/^q/.test(u)) return `${n}Q` as PeriodCode;
    if (/^h/.test(u) && (n === "1" || n === "2")) return `${n}H` as PeriodCode;
    if ((u === "period" || u === "per") && Number(n) <= 3) return `${n}P` as PeriodCode;
  }
  m = t.match(/\bq\s?([1-4])\b/);
  if (m) return `${m[1]}Q` as PeriodCode;
  if (/\bfirst half\b|\b1st half\b/.test(t)) return "1H";
  if (/\bsecond half\b|\b2nd half\b/.test(t)) return "2H";
  return null;
}

/** Market text without the period words: "Rec Yds 2Q" → "Rec Yds". */
export function stripPeriod(text: string): string {
  return text
    .replace(new RegExp(`\\s*[·•\\-–(]?\\s*\\b${N}\\s*(?:-|\\s)?\\s*(quarter|qtr|q|half|h|period|per)\\b\\s*\\)?`, "gi"), " ")
    .replace(/\bq\s?[1-4]\b/gi, " ")
    .replace(/\s*·\s*$/, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** "receiving yards" + "2Q" → "receiving yards · 2nd quarter" (the stored market). */
export function withPeriod(market: string, p: PeriodCode | null | undefined): string {
  const base = stripPeriod(market);
  return p ? `${base} · ${PERIOD_LABEL[p]}` : base;
}

export const periodLabel = (p: PeriodCode) => PERIOD_LABEL[p];
void ORD;

const FOOTBALL = new Set(["nfl", "ncaaf"]);
const HOOPS = new Set(["nba", "wnba", "ncaam", "ncaaw"]);
export const periodSport = (league: string) => (FOOTBALL.has(league) ? "football" : HOOPS.has(league) ? "hoops" : null);

/** Which period numbers a code covers in this league. Null = not a thing in this sport. OT counts only for a 2nd half (DraftKings). */
export function periodsFor(league: string, p: PeriodCode, last: number): number[] | null {
  const halves = league === "ncaam";
  const sp = periodSport(league);
  if (!sp) return null;
  if (p.endsWith("P")) return null;
  const tail = (from: number) => Array.from({ length: Math.max(0, last - from + 1) }, (_, i) => from + i);
  if (halves) {
    if (p.endsWith("Q")) return null;
    return p === "1H" ? [1] : [2, ...tail(3)];
  }
  if (p.endsWith("Q")) return [Number(p[0])];
  return p === "1H" ? [1, 2] : [3, 4, ...tail(5)];
}

/** Box keys we can sum from plays, per sport. Anything else stays grade-it-yourself for a period leg. */
export const FOOTBALL_KEYS = ["passingYards", "passingAttempts", "completions", "passingTouchdowns", "interceptions", "rushingYards", "rushingAttempts", "rushingTouchdowns", "receivingYards", "receptions", "receivingTouchdowns"];
export const HOOPS_KEYS = ["points", "rebounds", "offensiveRebounds", "defensiveRebounds", "assists", "steals", "blocks", "turnovers", "fieldGoalsMade", "fieldGoalsAttempted", "threePointFieldGoalsMade", "threePointFieldGoalsAttempted", "freeThrowsMade", "freeThrowsAttempted"];

type Raw = Record<string, unknown>;
const d = (x: unknown): Raw => (x && typeof x === "object" ? (x as Raw) : {});
const list = (x: unknown): Raw[] => (Array.isArray(x) ? (x as Raw[]) : []);
const idFromRef = (a: Raw): string | null => {
  if (typeof a.id === "string" || typeof a.id === "number") return String(a.id);
  const m = typeof a.$ref === "string" ? a.$ref.match(/athletes\/(\d+)/) : null;
  return m ? m[1] : null;
};

function bump(out: PeriodStats, period: number, id: string | null, key: string, by: number) {
  if (!id || !Number.isFinite(by)) return;
  const p = (out[String(period)] ??= {});
  const a = (p[id] ??= {});
  a[key] = (a[key] ?? 0) + by;
}

/**
 * Football, from ESPN core plays (…/competitions/{id}/plays). A "Penalty" play is a no-play and counts nothing;
 * a play that stands with a penalty keeps its type (Rush, Pass Reception) and counts. Sacks are not pass attempts.
 * Fumbles keep the rush or catch (and its yards) before the fumble.
 */
export function footballPeriodStats(corePlays: unknown, league = "nfl"): PeriodStats {
  const out: PeriodStats = {};
  for (const p of list(d(corePlays).items ?? corePlays)) {
    const type = String(d(p.type).text ?? "");
    const period = Number(d(p.period).number);
    if (!period) continue;
    const full = String(p.text ?? "");
    // A reviewed play reads "<first call> … REVERSED. <what stands>": only the part that stands counts.
    const rev = full.split(/REVERSED\.\s*/);
    const text = rev[rev.length - 1];
    if (/^Penalty$/i.test(type) || /\bno play\b/i.test(text)) continue;
    // Two-point tries are not in the box score.
    if (/two-point|2-pt|two point/i.test(type)) continue;
    const parts = list(p.participants);
    const who = (role: string) => {
      const x = parts.find((q) => q.type === role);
      return x ? idFromRef(d(x.athlete)) : null;
    };
    // College text reads "for 3 yards loss" and folds reviews differently; ESPN's statYardage is the play's yards there.
    const yds = league === "ncaaf" ? Number(p.statYardage ?? 0) || 0 : playYards(p, text);
    const passer = who("passer");
    const rusher = who("rusher");
    const receiver = who("receiver");
    const td = /touchdown/i.test(type);
    // College counts a sack as a rush by the passer; the NFL counts it as neither.
    if (/sack/i.test(type)) {
      if (league === "ncaaf") {
        bump(out, period, passer, "rushingAttempts", 1);
        bump(out, period, passer, "rushingYards", yds);
      }
      continue;
    }
    if (/interception/i.test(type)) {
      bump(out, period, passer, "passingAttempts", 1);
      bump(out, period, passer, "interceptions", 1);
      continue;
    }
    if (/incompletion/i.test(type)) {
      bump(out, period, passer, "passingAttempts", 1);
      continue;
    }
    const caught = passer && receiver && !/incomplete/i.test(text) && (/reception|passing touchdown/i.test(type) || /fumble/i.test(type));
    const lat = lateral(p, text);
    if (lat) bump(out, period, lat.id ?? "?", caught ? "receivingYards" : "rushingYards", lat.yds);
    if (caught) {
      bump(out, period, passer, "passingAttempts", 1);
      bump(out, period, passer, "completions", 1);
      bump(out, period, passer, "passingYards", yds + (lat?.yds ?? 0));
      bump(out, period, receiver, "receptions", 1);
      bump(out, period, receiver, "receivingYards", yds);
      if (td) {
        bump(out, period, passer, "passingTouchdowns", 1);
        bump(out, period, receiver, "receivingTouchdowns", 1);
      }
      continue;
    }
    if (rusher && (/^rush/i.test(type) || /rushing touchdown/i.test(type) || /fumble/i.test(type))) {
      bump(out, period, rusher, "rushingAttempts", 1);
      bump(out, period, rusher, "rushingYards", yds);
      if (td) bump(out, period, rusher, "rushingTouchdowns", 1);
    }
  }
  return out;
}

/** Yards credited to the ball carrier: the play's own "for N yards" (not penalty yards ESPN folds into statYardage). An offensive foul past the line, enforced at the spot, caps it at that spot. */
function playYards(p: Raw, text: string): number {
  const m = text.match(/\bfor (-?\d+) yards?\b|\bfor (no gain)\b/i) ?? text.match(/\b(-?\d+) Yd (?:pass|run|rush)\b()/i);
  // No "for N yards" (an aborted snap, a botched exchange): no yards to credit.
  let y = m ? (m[2] ? 0 : Number(m[1])) : 0;
  const pen = text.match(/PENALTY on ([A-Z]{2,4})-[^,]+,[^.]*?enforced at (?:([A-Z]{2,4}) (\d{1,2})|(50))\b/);
  const st = d(p.start);
  const half = gb(String(st.possessionText ?? "").split(" ")[0]);
  const ste = Number(st.yardsToEndzone);
  if (pen && !/declined|offsetting/i.test(text) && Number.isFinite(ste) && ste !== 50 && /^[A-Z]/.test(half)) {
    // The start spot names a field half. When the offense is backed up (> 50 to go) it is the offense's own half.
    const own = ste > 50;
    const ourFoul = own ? gb(pen[1]) === half : gb(pen[1]) !== half;
    if (ourFoul) {
      const n = pen[4] ? 50 : Number(pen[3]);
      const spotTe = pen[4] ? 50 : (gb(pen[2]) === half) === own ? 100 - n : n;
      const toSpot = ste - spotTe;
      if (toSpot >= 0 && toSpot < y) y = toSpot;
    }
  }
  // Fumble lost behind where the catch or run ended: credited only to the recovery spot.
  const end = text.match(/\bto ([A-Z]{2,4}) (\d{1,2}) for -?\d+ yards?/);
  const rec = text.match(/RECOVERED by [A-Z]{2,4}-[^\s]+ at ([A-Z]{2,4}) (\d{1,2})/) ?? text.match(/FUMBLES[\s\S]{0,60}?ball out of bounds at ([A-Z]{2,4}) (\d{1,2})/);
  if ((/Fumble Recovery \(Opponent\)/i.test(String(d(p.type).text ?? "")) || /ball out of bounds/i.test(text)) && end && rec && Number.isFinite(ste)) {
    const teEnd = ste - y;
    const n = Number(end[2]);
    const defHalf = n === teEnd ? gb(end[1]) : 100 - n === teEnd ? null : undefined;
    if (defHalf !== undefined) {
      const rn = Number(rec[2]);
      const recDef = defHalf ? gb(rec[1]) === defHalf : gb(rec[1]) !== gb(end[1]);
      const teRec = recDef ? rn : 100 - rn;
      if (teRec > teEnd) y = Math.max(ste - teRec, Math.min(y, ste - teRec));
    }
  }
  return y;
}

/** NFL gamebook abbreviations in play text vs ESPN's (HST = HOU). */
const GB: Record<string, string> = { HST: "HOU", ARZ: "ARI", BLT: "BAL", CLV: "CLE", LA: "LAR", WAS: "WSH" };
const gb = (a: string) => GB[a] ?? a;

/** "… for 2 yards. Lateral to Bi.Robinson … for 14 yards": the lateral's yards, credited to the one "other" participant. */
function lateral(p: Raw, text: string): { id: string | null; yds: number } | null {
  const m = text.match(/\blateral to [A-Z][a-z]{0,2}\.\s?[A-Za-z'-]+[^.]*?\bfor (?:(-?\d+) yards?|(no gain))/i);
  if (!m) return null;
  const others = list(p.participants).filter((q) => q.type === "other");
  return { id: others.length === 1 ? idFromRef(d(others[0].athlete)) : null, yds: m[2] ? 0 : Number(m[1]) };
}

/** Basketball, from ESPN summary plays. First participant is the shooter / rebounder; on a make the second is the assist, on a miss the block, on a turnover the steal. */
export function hoopsPeriodStats(summaryPlays: unknown): PeriodStats {
  const out: PeriodStats = {};
  for (const p of list(summaryPlays)) {
    const period = Number(d(p.period).number);
    if (!period) continue;
    const type = String(d(p.type).text ?? "");
    const text = String(p.text ?? "");
    const ids = list(p.participants).map((q) => idFromRef(d(q.athlete)));
    // The shooter is listed first; on a blocked shot the blocker is second.
    const blocked = p.shootingPlay === true && /\bblocks\b/i.test(text) && ids.length > 1;
    const a = ids[0] ?? null;
    const b = ids[1] ?? null;
    // End-of-period heaves are not field goal attempts in the official box.
    if (/heave/i.test(type)) continue;
    if (p.shootingPlay === true) {
      const made = p.scoringPlay === true;
      if (/free ?throw/i.test(type)) {
        bump(out, period, a, "freeThrowsAttempted", 1);
        if (made) {
          bump(out, period, a, "freeThrowsMade", 1);
          bump(out, period, a, "points", 1);
        }
        continue;
      }
      const three = Number(p.pointsAttempted) === 3 || /three point/i.test(text);
      bump(out, period, a, "fieldGoalsAttempted", 1);
      if (three) bump(out, period, a, "threePointFieldGoalsAttempted", 1);
      if (made) {
        bump(out, period, a, "fieldGoalsMade", 1);
        if (three) bump(out, period, a, "threePointFieldGoalsMade", 1);
        bump(out, period, a, "points", Number(p.scoreValue) || (three ? 3 : 2));
        if (b) bump(out, period, b, "assists", 1);
      } else if (b && blocked) bump(out, period, b, "blocks", 1);
      continue;
    }
    // College posts steals and blocks as their own plays.
    if (/^steal$/i.test(type)) {
      bump(out, period, a, "steals", 1);
      continue;
    }
    if (/^block( shot)?$/i.test(type)) {
      bump(out, period, a, "blocks", 1);
      continue;
    }
    if (/rebound/i.test(type) && a) {
      bump(out, period, a, "rebounds", 1);
      bump(out, period, a, /offensive/i.test(type) ? "offensiveRebounds" : "defensiveRebounds", 1);
      continue;
    }
    if ((/turnover/i.test(type) || /\bturnover\b/i.test(text)) && a && !/team turnover/i.test(text)) {
      bump(out, period, a, "turnovers", 1);
      if (b && /steal/i.test(text)) bump(out, period, b, "steals", 1);
    }
  }
  return out;
}

export type PeriodState = "pending" | "live" | "done";

/** Where a period leg stands: waits until its first period starts, live during it, done once it's over (even mid-game). */
export function periodState(league: string, code: PeriodCode, snap: { state: "pre" | "in" | "post"; period?: number | null; detail?: string | null }): PeriodState {
  if (snap.state === "pre") return "pending";
  if (snap.state === "post") return "done";
  const now = Number(snap.period ?? 0);
  const ps = periodsFor(league, code, Math.max(now, 4));
  if (!ps) return "pending";
  const first = ps[0];
  const isOpenEnded = code === "2H";
  const last = ps[ps.length - 1];
  if (now < first) return "pending";
  if (isOpenEnded) return "live";
  if (now > last) return "done";
  // Between periods ("End of 2nd Quarter", "Halftime") the period has ended.
  if (now === last && /^(end of|halftime|end)/i.test(String(snap.detail ?? "").trim())) return "done";
  return "live";
}

/** One athlete's summed box keys over a period code, as strings like the box score statMap. Zeros for keys with no plays. */
export function periodMap(league: string, code: PeriodCode, stats: PeriodStats | undefined, athleteId: string, lastPeriod: number): Record<string, string> | null {
  const sp = periodSport(league);
  const ps = periodsFor(league, code, Math.max(lastPeriod, 4));
  if (!sp || !ps || !stats) return null;
  const keys = sp === "football" ? FOOTBALL_KEYS : HOOPS_KEYS;
  const out: Record<string, string> = {};
  for (const k of keys) {
    let v = 0;
    for (const n of ps) v += stats[String(n)]?.[athleteId]?.[k] ?? 0;
    out[k] = String(v);
  }
  return out;
}
