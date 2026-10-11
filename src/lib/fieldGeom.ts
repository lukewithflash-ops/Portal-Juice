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
