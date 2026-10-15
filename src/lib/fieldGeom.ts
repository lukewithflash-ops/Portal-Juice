/**
 * Football field geometry, fixed per game like ESPN: away end zone on the left, home on the right.
 * SVG x runs 0–120 (end zones 0–10 and 110–120). Pure.
 */
export type FieldSide = "home" | "away";

/** x of a spot `toGoal` yards from the goal the offense attacks. Home attacks left, away attacks right. */
export function spotX(offense: FieldSide, toGoal: number): number {
  return offense === "home" ? 10 + toGoal : 110 - toGoal;
}

export function fieldGeom(offense: FieldSide, toGoal: number | null, distance: number | null) {
  if (toGoal === null) return null;
  const ball = spotX(offense, toGoal);
  const firstToGoal = distance !== null && distance > 0 ? Math.max(0, toGoal - distance) : null;
  return {
    ball,
    first: firstToGoal !== null ? spotX(offense, firstToGoal) : null,
    /** +1 = attacking right, -1 = attacking left. */
    dir: offense === "home" ? -1 : 1,
    redZone: offense === "home" ? { x: 10, w: 20 } : { x: 90, w: 20 },
  };
}

/** "JAX 46" + the offense's own abbr → yards to the goal it attacks. Midfield "50" → 50. */
export function toGoalFromSpot(spot: string, offenseAbbrs: string[]): number | null {
  const m = spot.trim().match(/^([A-Za-z&.]+)?\s*(\d{1,2})$/);
  if (!m) return null;
  const yd = Number(m[2]);
  if (yd === 50 || !m[1]) return yd === 50 ? 50 : null;
  const own = offenseAbbrs.some((a) => a && a.toUpperCase() === m[1].toUpperCase());
  return own ? 100 - yd : yd;
}

/** The bits of a play the drive trail needs. Matches LivePlay's football fields. */
export type TrailPlay = {
  id: string;
  typeText: string;
  text: string;
  yardsToEndzone: number | null;
  startTeamId?: string | null;
  teamId: string | null;
  endToGoal?: number | null;
  endTeamId?: string | null;
  penalty?: boolean;
  turnover?: boolean;
  scoring: boolean;
};

export type TrailSeg = { id: string; x1: number; x2: number; gain: number; penalty: boolean; turnover: boolean; scoring: boolean; kick: boolean; tag: string | null };

const NOT_A_SNAP = /timeout|end period|end of|end quarter|end half|two-minute|kickoff|coin toss|extra point|two-point|pat\b|end game/i;

/**
 * One segment per snap of a drive, start spot to end spot, in field x for the drive's team.
 * Spots ESPN measured for the other team (after a turnover) are flipped onto the same axis. Pure.
 */
export function driveTrail(plays: TrailPlay[], driveTeamId: string, offense: FieldSide): TrailSeg[] {
  const mine = (y: number | null | undefined, team: string | null | undefined): number | null => {
    if (y == null || !Number.isFinite(y) || y < 0 || y > 100) return null;
    if (!team || team === driveTeamId) return y;
    return 100 - y;
  };
  const out: TrailSeg[] = [];
  for (const p of plays) {
    if (NOT_A_SNAP.test(p.typeText) || (/^(end|official timeout|timeout)/i.test(p.text))) continue;
    const from = mine(p.yardsToEndzone, p.startTeamId ?? p.teamId);
    const fg = /field goal/i.test(p.typeText);
    const punt = /punt/i.test(p.typeText);
    // A field goal flies at the posts, wherever ESPN parks the next spot.
    const to = fg ? 0 : mine(p.endToGoal, p.endTeamId);
    if (from === null || to === null) continue;
    const td = /touchdown/i.test(p.typeText) || (p.scoring && /touchdown/i.test(p.text));
    const tag = td ? "TD" : fg ? (p.scoring ? "FG" : "FG ✗") : punt ? "PUNT" : p.turnover ? "TO" : null;
    out.push({
      id: p.id,
      x1: spotX(offense, from),
      x2: spotX(offense, to),
      gain: from - to,
      penalty: !!p.penalty,
      turnover: !!p.turnover,
      scoring: p.scoring,
      kick: fg || punt,
      tag,
    });
  }
  return out;
}
