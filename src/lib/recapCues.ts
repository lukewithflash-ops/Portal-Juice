/**
 * Deterministic "what went wrong" causes and "next time" checks for a recap, computed from real numbers.
 * The AI may only pick from these; it never writes its own. Pure.
 */
export type CueInput = {
  side: "Over" | "Under" | null;
  line: number;
  value: number | null;
  /** Newest first, as the breakdown reports it (may include this game). */
  last10: number[];
  last5Avg: number | null;
  seasonAvg: number | null;
  minutes: number | null;
  fouls: number | null;
  overtime: boolean;
  spreadHome: number | null;
  spreadOpenHome: number | null;
  total: number | null;
  totalOpen: number | null;
  finalMarginHome: number;
  finalTotal: number;
  /** "She"/"He"/name. */
  who: string;
};

export type Cues = { wrong: string[]; next: string[] };

const r1 = (n: number) => Math.round(n * 10) / 10;

export function recapCues(c: CueInput): Cues {
  const wrong: string[] = [];
  const next: string[] = [];
  if (c.value == null || !c.side) return { wrong, next };
  const over = c.side === "Over";
  const miss = over ? c.value < c.line : c.value > c.line;
  const by = r1(Math.abs(c.value - c.line));
  // Pre-game sample: drop this game if the newest entry is it.
  const pre = c.last10.length && c.last10[0] === c.value ? c.last10.slice(1) : c.last10;
  if (pre.length >= 5) {
    const k = pre.filter((x) => x > c.line).length;
    const leanOver = k / pre.length > 0.5;
    if (leanOver !== over) {
      wrong.push(`The hit rate leaned ${over ? "under" : "over"}: ${c.who} cleared ${c.line} in ${k} of ${pre.length} games before this one.`);
      next.push(`${c.who} cleared ${c.line} in ${k} of last ${pre.length}. When the hit rate leans the other way, pass or flip the side.`);
    } else {
      next.push(`The hit rate backed it (${k} of ${pre.length} over ${c.line}). This one landed ${by} ${miss ? "short" : "past"}: one game, not a trend.`);
    }
  }
  if (c.last5Avg != null && c.seasonAvg != null) {
    const recentWrong = over ? c.last5Avg < c.line : c.last5Avg > c.line;
    const seasonRight = over ? c.seasonAvg > c.line : c.seasonAvg < c.line;
    if (recentWrong && seasonRight) {
      wrong.push(`Recent form was ${over ? "below" : "above"} the line: last 5 avg ${c.last5Avg} vs ${c.line}, even with a season avg of ${c.seasonAvg}.`);
      next.push(`Last 5 avg (${c.last5Avg}) sat on the wrong side of ${c.line} while the season avg (${c.seasonAvg}) didn't. Weight recent form when they split.`);
    }
  }
  const spread = c.spreadHome != null ? Math.abs(c.spreadHome) : null;
  const margin = Math.abs(c.finalMarginHome);
  if ((spread != null && spread >= 10) || margin >= 15) {
    wrong.push(`Game script: ${spread != null ? `spread was ${spread}, ` : ""}final margin ${margin}${c.minutes != null ? `, ${c.minutes} minutes played` : ""}.`);
    next.push(`${spread != null ? `Spread was ${spread}` : `Final margin was ${margin}`}. Check spreads over 10 for minutes risk before an over.`);
  }
  if (c.fouls != null && c.fouls >= 5) wrong.push(`Foul trouble: ${c.fouls} fouls${c.minutes != null ? ` in ${c.minutes} minutes` : ""}.`);
  if (c.total != null && c.totalOpen != null && Math.abs(c.total - c.totalOpen) >= 2) {
    const down = c.total < c.totalOpen;
    if (down === over) {
      wrong.push(`The game total moved ${down ? "down" : "up"} before tip: ${c.totalOpen} to ${c.total}.`);
      next.push(`The total moved ${c.totalOpen} → ${c.total} before tip, against the ${c.side.toLowerCase()}. Treat a 2+ point move as a signal.`);
    }
  }
  if (c.overtime && miss && over) wrong.push(`Overtime added minutes${c.minutes != null ? ` (${c.minutes} played)` : ""} and it still fell ${by} short.`);
  return { wrong: wrong.slice(0, 4), next: next.slice(0, 4) };
}

/** Parse the breakdown's facts into cue inputs. */
export function parseLast10(v: string | undefined): number[] {
  if (!v) return [];
  return v.replace(/\(.*\)/, "").split(",").map((x) => Number(x.trim())).filter((x) => Number.isFinite(x));
}
export function firstNum(v: string | undefined): number | null {
  const m = v?.match(/-?\d+(\.\d+)?/);
  return m ? Number(m[0]) : null;
}
