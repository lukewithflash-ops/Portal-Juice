/**
 * Who gets the ball after a break, from ESPN's own plays only. Never a guess:
 * every field is null unless the feed shows the play that decides it.
 */
export type BreakFacts = {
  /** Football: team that kicked off to open the game (ESPN start.team on the first Kickoff play of period 1). */
  openKickTeamId?: string | null;
  /** Football: team that kicked off to open the 3rd quarter, once that play exists. */
  thirdKickTeamId?: string | null;
  /** Basketball: team that gained possession on the opening jump ball (period 1). */
  tipWinnerId?: string | null;
};

type D = Record<string, unknown>;
const dict = (v: unknown): D => (v && typeof v === "object" ? (v as D) : {});
const s = (v: unknown): string | null => (typeof v === "string" && v ? v : typeof v === "number" ? String(v) : null);
const periodOf = (p: D): number | null => {
  const n = Number(dict(p.period).number ?? p.period);
  return Number.isFinite(n) ? n : null;
};

/** raw ESPN plays in game order. teamIds = [awayId, homeId]. */
export function breakFacts(raw: unknown[], football: boolean, teamIds: string[]): BreakFacts {
  const ok = (id: string | null) => (id && teamIds.includes(id) ? id : null);
  if (football) {
    const kick = (period: number) => {
      const p = raw.map(dict).find((x) => periodOf(x) === period && /^kickoff/i.test(s(dict(x.type).text) || ""));
      return p ? ok(s(dict(dict(p.start).team).id)) : null;
    };
    const open = kick(1);
    const third = kick(3);
    return open || third ? { openKickTeamId: open, thirdKickTeamId: third } : {};
  }
  const tip = raw.map(dict).find((x) => periodOf(x) === 1 && /jump ?ball/i.test(s(dict(x.type).text) || ""));
  if (!tip) return {};
  // ESPN puts the gaining team on the jump-ball play ("(X gains possession)").
  if (!/gains possession/i.test(s(tip.text) || "")) return {};
  const w = ok(s(dict(tip.team).id));
  return w ? { tipWinnerId: w } : {};
}

export type NextBall = { teamId: string; line: string; why: string };

/** Is the game in a break between periods right now? */
export function inBreak(state: string, detail: string): boolean {
  return state === "in" && /halftime|^end of|^end \d|end of (the )?\d|intermission/i.test(detail);
}

/**
 * What to show on the break panel. `period` = ESPN period number during the break (the one just ended).
 * Only NFL/NCAAF and NBA/WNBA rules are applied; college basketball's arrow moves with held balls, so it is omitted.
 */
export function nextBall(league: string, period: number | null, detail: string, f: BreakFacts | undefined, ids: { away: string; home: string }): NextBall | null {
  if (!f || period === null) return null;
  const other = (t: string) => (t === ids.away ? ids.home : t === ids.home ? ids.away : null);
  if (league === "nfl" || league === "ncaaf") {
    if (!/halftime/i.test(detail) || period !== 2) return null;
    if (f.thirdKickTeamId) {
      const r = other(f.thirdKickTeamId);
      return r ? { teamId: r, line: "Receives 2nd half", why: "From the 3rd-quarter kickoff in ESPN's play-by-play." } : null;
    }
    if (f.openKickTeamId) {
      const r = f.openKickTeamId; // the team that kicked to start the game gets the 2nd-half choice
      return { teamId: r, line: "Set to receive 2nd half", why: "They kicked off to open the game, so the 2nd-half choice is theirs (ESPN opening kickoff)." };
    }
    return null;
  }
  if (league === "nba" || league === "wnba") {
    if (!f.tipWinnerId || period < 1 || period > 3) return null;
    const loser = other(f.tipWinnerId);
    if (!loser) return null;
    const next = period + 1;
    const team = next === 4 ? f.tipWinnerId : loser;
    return { teamId: team, line: `Ball to start Q${next}`, why: next === 4 ? "Won the opening tip, so they start the 4th." : "Lost the opening tip, so they start the 2nd and 3rd." };
  }
  return null;
}
