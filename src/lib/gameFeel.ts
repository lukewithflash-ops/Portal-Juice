/**
 * Video-game feel, from real play data only. Pure, so tests can run it.
 * Overtime and clutch, team runs, heat checks.
 */
import type { LivePlay, LiveSnap } from "@/lib/live";
import { playerFromText, scoringRun } from "@/lib/tracker";

const BASKET = new Set(["nba", "wnba", "ncaaw"]);

/** Periods in regulation. Null when the sport has no fixed count we read (tennis, golf, UFC). */
export function regulation(league: string): number | null {
  if (BASKET.has(league) || league === "nfl" || league === "ncaaf") return 4;
  if (league === "ncaam") return 2;
  if (league === "nhl") return 3;
  if (league === "mlb") return 9;
  return 2; // soccer halves
}

export function isOvertime(league: string, period: number | null): boolean {
  const reg = regulation(league);
  return reg != null && period != null && period > reg;
}

/** "OT", "2OT", "10th" (extra innings), "Shootout" (NHL period 5 in the regular season), "Extra time". */
export function otLabel(league: string, period: number | null): string | null {
  const reg = regulation(league);
  if (reg == null || period == null || period <= reg) return null;
  const n = period - reg;
  if (league === "mlb") return `Extra innings · ${period}th`;
  if (league === "nhl" && n >= 2) return "Shootout";
  if (league !== "nfl" && league !== "ncaaf" && !BASKET.has(league) && league !== "ncaam" && league !== "nhl") return "Extra time";
  return n === 1 ? "OT" : `${n}OT`;
}

function seconds(clock: string | null): number | null {
  if (!clock) return null;
  const m = clock.match(/^(\d+):(\d{2})/);
  if (m) return Number(m[1]) * 60 + Number(m[2]);
  const s = Number(clock);
  return Number.isFinite(s) ? s : null;
}

/** Clutch: live, overtime, or the last 2 minutes of the last period in a one-score game. */
export function clutch(league: string, snap: Pick<LiveSnap, "state" | "period" | "clock" | "awayScore" | "homeScore"> | null): boolean {
  if (!snap || snap.state !== "in") return false;
  if (isOvertime(league, snap.period)) return true;
  const reg = regulation(league);
  if (reg == null || snap.period == null || snap.period < reg) return false;
  const margin = Math.abs((Number(snap.homeScore) || 0) - (Number(snap.awayScore) || 0));
  const close = BASKET.has(league) || league === "ncaam" ? margin <= 5 : league === "nfl" || league === "ncaaf" ? margin <= 8 : league === "mlb" ? margin <= 1 : margin <= 1;
  if (league === "mlb") return close;
  const left = seconds(snap.clock);
  return close && left != null && left <= 120;
}

/** A team run worth a combo meter: "8-0 RUN". */
export function runMeter(plays: LivePlay[]): { teamId: string; label: string; fire: boolean } | null {
  const r = scoringRun(plays);
  if (!r) return null;
  return { teamId: r.teamId, label: `${r.us}-${r.them} RUN`, fire: r.us >= 8 && r.us - r.them >= 8 };
}

/** Heat check: one player made 3 of their team's last 4 scores. */
export function heatCheck(plays: LivePlay[]): { name: string; teamId: string; made: number } | null {
  const scores = plays.filter((p) => p.scoring && p.points > 0 && p.teamId);
  if (scores.length < 3) return null;
  const lastTeam = scores[scores.length - 1].teamId as string;
  const mine = scores.filter((p) => p.teamId === lastTeam).slice(-4);
  const count = new Map<string, number>();
  for (const p of mine) {
    const who = playerFromText(p.text);
    if (who) count.set(who, (count.get(who) ?? 0) + 1);
  }
  for (const [name, n] of count) if (n >= 3) return { name, teamId: lastTeam, made: n };
  return null;
}

/** Huge plays shake the screen: TDs, goals, homers, picks, a go-ahead score in clutch time. */
export function isHuge(p: LivePlay, inClutch: boolean): boolean {
  const t = `${p.typeText} ${p.text}`.toLowerCase();
  if (/touchdown|home run|intercept|\bgoal\b/.test(t) && (p.scoring || /intercept/.test(t))) return true;
  return inClutch && p.scoring && p.points >= 2;
}

/** Period number from ESPN's play label: "3rd" → 3, "OT" → reg+1, "2OT" → reg+2, "5" → 5. */
export function periodFromText(text: string | null | undefined, league: string): number | null {
  if (!text) return null;
  const reg = regulation(league) ?? 4;
  const ot = text.match(/^(\d*)\s*OT$/i);
  if (ot) return reg + (Number(ot[1]) || 1);
  const n = parseInt(text, 10);
  return Number.isFinite(n) ? n : null;
}
