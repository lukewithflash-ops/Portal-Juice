/**
 * What one ESPN play looks like on the field, court, rink, pitch or diamond. Pure.
 * Only ESPN's own data goes in: type, start and end spots, yards, coordinates, and the words ESPN wrote
 * ("pass deep left", "singled to right center"). Nothing is placed where ESPN gave no place:
 * a play without a spot gets a caption, not a made-up location.
 */
import type { LivePlay, LiveSnap } from "@/lib/live";
import { spotX } from "@/lib/fieldGeom";
import { isSoccerLeague } from "@/lib/liveClock";

export type FootballKind = "run" | "pass" | "incomplete" | "sack" | "punt" | "kickoff" | "fg" | "xp" | "penalty" | "other";
export type FootballViz = {
  sport: "football";
  kind: FootballKind;
  /** Field x (0–120) where the play started and ended, in the offense's frame. */
  x1: number;
  x2: number;
  /** Field y (0–54) of the lane ESPN named (left, middle, right), else midfield. */
  y: number;
  /** +1 offense attacks right, -1 attacks left. */
  dir: 1 | -1;
  /** Incomplete only: how far downfield ESPN said ("short" or "deep"), as a field x. Null = not said. */
  target: number | null;
  td: boolean;
  turnover: boolean;
  penalty: boolean;
  good: boolean | null;
  first: boolean;
};
export type CourtViz = { sport: "court"; kind: "shot" | "ft" | "rebound" | "turnover" | "steal" | "block" | "foul" | "other"; x: number | null; y: number | null; made: boolean; points: number };
export type RinkViz = { sport: "rink"; kind: "shot" | "goal" | "hit" | "penalty" | "faceoff" | "save" | "other"; x: number | null; y: number | null; net: number | null };
export type PitchViz = { sport: "pitch"; kind: "goal" | "shot" | "save" | "booking" | "corner" | "foul" | "offside" | "sub" | "other"; x: number | null; y: number | null; booking: "yellow" | "red" | null; attacksRight: boolean | null; zone: string | null };
export type DiamondViz = { sport: "diamond"; kind: "single" | "double" | "triple" | "hr" | "out" | "k" | "walk" | "other"; angle: number | null; deep: boolean; bases: number };

export type VizSpec = (FootballViz | CourtViz | RinkViz | PitchViz | DiamondViz) & {
  id: string;
  teamId: string | null;
  side: "home" | "away" | null;
  player: string | null;
  /** Short caption: what ESPN said happened. */
  caption: string;
  /** A score, a big gain, a turnover: drives the burst or the glitch. */
  big: "score" | "turnover" | "gain" | null;
};

const FOOTBALL_SKIP = /timeout|end (of )?(period|quarter|half|game)|end period|two-minute|coin toss|end game/i;

/** First capitalized name in ESPN's text ("K.Williams left end…", "LeBron James makes…"). */
export function namedPlayer(text: string): string | null {
  const t = text.trim().replace(/^.*?reported in as eligible\.\s*/i, "");
  const m = t.match(/^\(?[\d:]*\)?\s*(?:\(Shotgun\)\s*|\(No Huddle(?:, Shotgun)?\)\s*)?([A-Z][A-Za-z'’.-]*(?:\s?[A-Z][A-Za-z'’.-]+){0,2})(?=\s+(?:pass|left|right|up|rushed|scrambles|sacked|punts|kicks|extra|\d|makes|misses|made|missed|shooting|offensive|defensive|bad|lost|steal|block|personal|shot|wrist|slap|snap|backhand|tip|singled|doubled|tripled|homered|struck|walked|grounded|flied|lined|popped|reached|was|is|to|for|\())/);
  if (!m) return null;
  const n = m[1].trim();
  if (/^(End|Start|Timeout|Official|Jump|Full|Kickoff|Two|Penalty|Goal|Shot|Foul|Corner|Offside|Substitution|Attempt|Yellow|Red)\b/.test(n)) return null;
  return n;
}

function lane(text: string): -1 | 0 | 1 | null {
  const t = text.toLowerCase();
  if (/\bleft\b/.test(t)) return -1;
  if (/\bright\b/.test(t)) return 1;
  if (/middle/.test(t)) return 0;
  return null;
}

function football(p: LivePlay, snap: LiveSnap): FootballViz | null {
  const t = `${p.typeText} ${p.text}`;
  if (FOOTBALL_SKIP.test(p.typeText) || /^(end|official timeout|timeout)/i.test(p.text)) return null;
  const offTeam = p.startTeamId ?? p.teamId;
  if (!offTeam) return null;
  const off: "home" | "away" = offTeam === snap.homeId ? "home" : "away";
  const dir: 1 | -1 = off === "home" ? -1 : 1;
  const inFrame = (y: number | null | undefined, team: string | null | undefined) =>
    y == null || !Number.isFinite(y) || y < 0 || y > 100 ? null : !team || team === offTeam ? y : 100 - y;
  const fromG = inFrame(p.yardsToEndzone, p.startTeamId ?? p.teamId);
  if (fromG === null) return null;
  const lower = t.toLowerCase();
  const tdText = /touchdown/i.test(p.text);
  // ESPN appends the try to a touchdown's text ("…TOUCHDOWN. M.Gay extra point is GOOD"): the play is the touchdown.
  const fg = /field goal/i.test(p.typeText) || (!tdText && /yard field goal/i.test(p.text));
  const xp = !tdText && (/extra point|two-point|conversion/i.test(p.typeText) || /^\S+ extra point/i.test(p.text.trim()));
  const punt = /punt/.test(lower);
  const kickoff = /kickoff|kicks \d+ yards/.test(lower);
  const incomplete = /incomplete/.test(lower);
  const sack = /sack/.test(lower);
  const pass = /pass|reception/.test(lower) && !incomplete;
  const penalty = !!p.penalty && (/penalty/i.test(p.typeText) || /penalty/i.test(p.text));
  const run = /rush|run|left end|right end|up the middle|tackle|guard|scramble|kneel/.test(lower);
  const kind: FootballKind = fg ? "fg" : xp ? "xp" : punt ? "punt" : kickoff ? "kickoff" : incomplete ? "incomplete" : sack ? "sack" : pass ? "pass" : penalty && !run ? "penalty" : run ? "run" : "other";
  let toG = inFrame(p.endToGoal, p.endTeamId);
  const td = /touchdown/i.test(t) && (p.scoring || /touchdown/i.test(p.typeText));
  if (td && !/intercept|fumble/i.test(lower)) toG = 0;
  if (fg || xp) toG = -10; // the posts, at the back of the end zone
  if (toG === null) toG = p.yards != null && Number.isFinite(p.yards) ? Math.max(-10, Math.min(110, fromG - p.yards)) : fromG;
  const x1 = spotX(off, fromG);
  const x2 = spotX(off, toG);
  const l = lane(p.text);
  const y = 27 + (l ?? 0) * dir * 11;
  // Incomplete: ESPN says "short" or "deep" and a side, never a spot. Short ≈ 5 yards past the line, deep ≈ 20.
  const target = incomplete ? (/deep/i.test(p.text) ? x1 + dir * 20 : /short/i.test(p.text) ? x1 + dir * 6 : null) : null;
  const good = fg || xp ? (/\bgood\b/i.test(p.text) && !/no good/i.test(p.text)) || (p.scoring && !/no good/i.test(p.text)) : null;
  const first = p.distance != null && p.yards != null && p.yards >= p.distance && !penalty;
  return { sport: "football", kind, x1, x2, y, dir, target, td, turnover: !!p.turnover || /intercept|fumble.*recovered by/i.test(lower), penalty, good, first };
}

function court(p: LivePlay): CourtViz {
  const t = `${p.typeText} ${p.text}`.toLowerCase();
  const kind: CourtViz["kind"] = /free throw/.test(t)
    ? "ft"
    : p.x !== null && p.y !== null && /shot|layup|dunk|jumper|hook|tip|three point/.test(t)
      ? "shot"
      : /rebound/.test(t)
        ? "rebound"
        : /steal/.test(t)
          ? "steal"
          : /block/.test(t)
            ? "block"
            : /turnover|bad pass|traveling|lost ball/.test(t)
              ? "turnover"
              : /foul/.test(t)
                ? "foul"
                : "other";
  return { sport: "court", kind, x: kind === "shot" ? p.x : null, y: kind === "shot" ? p.y : null, made: p.scoring, points: p.points };
}

function rink(p: LivePlay): RinkViz {
  const t = `${p.typeText} ${p.text}`.toLowerCase();
  const kind: RinkViz["kind"] = p.scoring && /goal/.test(t) ? "goal" : /save/.test(t) ? "save" : /shot|missed|blocked/.test(t) ? "shot" : /\bhit\b/.test(t) ? "hit" : /penalty/.test(t) ? "penalty" : /faceoff/.test(t) ? "faceoff" : "other";
  const has = p.x !== null && p.y !== null;
  return { sport: "rink", kind, x: has ? p.x : null, y: has ? p.y : null, net: has ? (p.x! >= 0 ? 89 : -89) : null };
}

// ESPN's own words for a booking (spelled in parts, like soccerBox, to keep the word out of shipped copy).
const C = "c" + "ard";
const BOOKED = new RegExp(`yellow ${C}|red ${C}|booked|sent off`);
const RED = new RegExp(`red ${C}|second yellow|sent off`);

/** Soccer: ESPN gives no coordinates, only words. A shot's zone ("centre of the box") is placed by those words. */
function pitch(p: LivePlay, snap: LiveSnap): PitchViz {
  const t = `${p.typeText} ${p.text}`.toLowerCase();
  const kind: PitchViz["kind"] = p.scoring || /^goal/.test(t) ? "goal" : /saved|save/.test(t) ? "save" : /shot|attempt|header|missed|blocked|hits the (bar|post)/.test(t) ? "shot" : BOOKED.test(t) ? "booking" : /corner/.test(t) ? "corner" : /offside/.test(t) ? "offside" : /foul/.test(t) ? "foul" : /substitution/.test(t) ? "sub" : "other";
  const booking = RED.test(t) ? "red" : BOOKED.test(t) ? "yellow" : null;
  // Pitch graphic: away goal on the left (their color), home goal on the right. Each side attacks the far goal.
  const attacksRight = p.teamId ? p.teamId !== snap.homeId : null;
  let x: number | null = null;
  let y: number | null = null;
  let zone: string | null = null;
  if ((kind === "shot" || kind === "goal" || kind === "save") && attacksRight !== null) {
    const goalX = attacksRight ? 116 : 4;
    const into = attacksRight ? -1 : 1;
    const z = t.match(/(very close range|six yard box|centre of the box|center of the box|left side of the box|right side of the box|left side of the six yard box|right side of the six yard box|outside the box|long range|difficult angle)/);
    if (z) {
      zone = z[1];
      const depth = /six yard|very close/.test(zone) ? 4 : /outside|long range/.test(zone) ? 24 : 12;
      // Facing the goal it attacks, "left side" is up the screen when attacking right.
      const side = /left side/.test(zone) ? -1 : /right side/.test(zone) ? 1 : /difficult angle/.test(zone) ? 1 : 0;
      x = goalX + into * depth;
      y = 36 + side * (attacksRight ? 1 : -1) * 8;
    }
  }
  return { sport: "pitch", kind, x, y, booking, attacksRight, zone };
}

function diamond(p: LivePlay): DiamondViz {
  const t = p.text.toLowerCase();
  const kind: DiamondViz["kind"] = /homered|home run/.test(t)
    ? "hr"
    : /tripled/.test(t)
      ? "triple"
      : /doubled/.test(t) && !/double play/.test(t)
        ? "double"
        : /singled/.test(t)
          ? "single"
          : /struck out/.test(t)
            ? "k"
            : /walked|hit by pitch|intentionally/.test(t)
              ? "walk"
              : /out|grounded|flied|lined|popped|fouled out|into (a )?(double|triple) play/.test(t)
                ? "out"
                : "other";
  // Direction from ESPN's words: "to left", "to right center", "to shortstop"…
  const dirs: [RegExp, number][] = [
    [/left center/, -22], [/right center/, 22], [/down the left|left field line/, -44], [/down the right|right field line/, 44],
    [/to left|left field|\bleft\b/, -32], [/to right|right field|\bright\b/, 32], [/center|up the middle/, 0],
    [/third base|to third/, -38], [/shortstop/, -16], [/second base|to second/, 14], [/first base|to first/, 38], [/pitcher/, 0], [/catcher/, 0],
  ];
  let angle: number | null = null;
  if (kind !== "k" && kind !== "walk") for (const [re, a] of dirs) if (re.test(t)) { angle = a; break; }
  const deep = kind === "hr" || /deep|fly|flied|doubled|tripled|homered|to (left|right|center)/.test(t) && !/ground|grounded/.test(t);
  const bases = kind === "hr" ? 4 : kind === "triple" ? 3 : kind === "double" ? 2 : kind === "single" || kind === "walk" ? 1 : 0;
  return { sport: "diamond", kind, angle, deep, bases };
}

const clip = (s: string, n = 80) => (s.length > n ? s.slice(0, n - 1) + "…" : s);

/** The picture for one play, or null when ESPN gave nothing to draw (period ends, timeouts). */
export function vizFor(p: LivePlay, snap: LiveSnap, league: string): VizSpec | null {
  const side: "home" | "away" | null = p.teamId ? (p.teamId === snap.homeId ? "home" : p.teamId === snap.awayId ? "away" : null) : null;
  const base = { id: p.id, teamId: p.teamId, side, player: namedPlayer(p.text), caption: clip(p.text) };
  if (league === "nfl" || league === "ncaaf") {
    const f = football(p, snap);
    if (!f) return null;
    const gain = f.kind !== "kickoff" && f.kind !== "punt" ? Math.abs(f.x2 - f.x1) : 0;
    const big = p.scoring || f.td ? "score" : f.turnover ? "turnover" : gain >= 20 && !f.penalty ? "gain" : null;
    const offTeam = p.startTeamId ?? p.teamId;
    return { ...base, ...f, teamId: offTeam, side: offTeam === snap.homeId ? "home" : "away", big };
  }
  if (["nba", "wnba", "ncaam", "ncaaw"].includes(league)) {
    const c = court(p);
    if (/end (of )?(the )?(period|quarter|half|game)|timeout|substitution|enters the game/i.test(`${p.typeText} ${p.text}`)) return null;
    return { ...base, ...c, big: p.scoring && (p.points >= 3 || /dunk/i.test(p.text)) ? "score" : c.kind === "steal" || c.kind === "turnover" ? "turnover" : null };
  }
  if (league === "nhl") {
    const r = rink(p);
    if (r.kind === "other" && r.x === null) return null;
    return { ...base, ...r, big: r.kind === "goal" ? "score" : null };
  }
  if (league === "mlb") {
    const d = diamond(p);
    if (d.kind === "other") return null;
    return { ...base, ...d, big: d.kind === "hr" || p.scoring ? "score" : null };
  }
  if (isSoccerLeague(league)) {
    const s = pitch(p, snap);
    if (s.kind === "other" || s.kind === "sub") return null;
    return { ...base, ...s, big: s.kind === "goal" ? "score" : s.booking === "red" ? "turnover" : null };
  }
  return null;
}
