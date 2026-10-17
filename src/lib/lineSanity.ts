/**
 * Sanity ranges for prop lines, per sport group and stat. A line outside its range is almost
 * always a misread (a jersey number, odds, a player count, a payout multiplier), so the
 * reader re-reads it from the slip text or flags "Check this line" instead of saving it quietly.
 * Ranges are generous: they catch misreads, not unusual alt lines.
 */

type R = [number, number];

const RANGES: Record<string, Record<string, R>> = {
  hockey: {
    "shots on goal": [0.5, 8.5],
    goals: [0.5, 2.5],
    assists: [0.5, 3.5],
    points: [0.5, 4.5],
    saves: [15.5, 45.5],
    "goals allowed": [0.5, 6.5],
    "blocked shots": [0.5, 6.5],
    blocks: [0.5, 6.5],
    hits: [0.5, 9.5],
    "fantasy score": [1, 40],
  },
  basketball: {
    points: [2.5, 55.5],
    rebounds: [0.5, 22.5],
    assists: [0.5, 17.5],
    "3-pointers": [0.5, 8.5],
    steals: [0.5, 4.5],
    blocks: [0.5, 5.5],
    "steals + blocks": [0.5, 7.5],
    turnovers: [0.5, 7.5],
    "free throws made": [0.5, 15.5],
    "points + rebounds + assists": [5.5, 75.5],
    "points + rebounds": [4.5, 65.5],
    "points + assists": [4.5, 65.5],
    "rebounds + assists": [1.5, 32.5],
    "fantasy score": [5, 90],
  },
  football: {
    "passing yards": [99.5, 450.5],
    "rushing yards": [4.5, 200.5],
    "receiving yards": [4.5, 200.5],
    "rushing + receiving yards": [9.5, 250.5],
    "passing + rushing yards": [99.5, 500.5],
    receptions: [0.5, 14.5],
    targets: [0.5, 16.5],
    completions: [5.5, 40.5],
    "pass attempts": [9.5, 55.5],
    "rush attempts": [1.5, 32.5],
    "passing touchdowns": [0.5, 4.5],
    interceptions: [0.5, 2.5],
    "longest rush": [2.5, 60.5],
    "longest reception": [4.5, 70.5],
    "longest completion": [9.5, 80.5],
    tackles: [0.5, 15.5],
    "fantasy score": [1, 60],
  },
  baseball: {
    hits: [0.5, 3.5],
    "total bases": [0.5, 4.5],
    "home runs": [0.5, 1.5],
    rbis: [0.5, 3.5],
    strikeouts: [0.5, 13.5],
    runs: [0.5, 2.5],
    "hits + runs + rbis": [0.5, 6.5],
    "fantasy score": [1, 60],
  },
  tennis: {
    aces: [0.5, 30.5],
    "double faults": [0.5, 12.5],
    "games won": [3.5, 30.5],
    "total games": [12.5, 65.5],
    "sets won": [0.5, 3.5],
    "total sets": [1.5, 5.5],
    breaks: [0.5, 9.5],
    "fantasy score": [1, 80],
  },
  soccer: {
    goals: [0.5, 2.5],
    assists: [0.5, 1.5],
    "goal + assist": [0.5, 2.5],
    shots: [0.5, 8.5],
    "shots on target": [0.5, 4.5],
    "shots on goal": [0.5, 4.5],
    "passes attempted": [5.5, 120.5],
    tackles: [0.5, 8.5],
    clearances: [0.5, 12.5],
    crosses: [0.5, 12.5],
    saves: [0.5, 9.5],
    "goals allowed": [0.5, 4.5],
    "shots assisted": [0.5, 6.5],
    fouls: [0.5, 5.5],
    "fantasy score": [1, 60],
  },
};

const GROUP: Record<string, string> = {
  nhl: "hockey", nba: "basketball", wnba: "basketball", ncaam: "basketball", ncaaw: "basketball",
  nfl: "football", ncaaf: "football", mlb: "baseball", atp: "tennis", wta: "tennis",
};
export const groupOfLeague = (league: string | null | undefined): string | null => (!league ? null : GROUP[league] ?? (league === "ufc" ? null : "soccer"));

/** The range for this stat. League known: that sport. Unknown: the widest range any sport allows for the stat. */
export function lineRange(league: string | null | undefined, market: string | null | undefined): R | null {
  const m = (market ?? "").toLowerCase().trim();
  if (!m) return null;
  const g = groupOfLeague(league);
  if (g) return RANGES[g]?.[m] ?? null;
  let lo = Infinity;
  let hi = -Infinity;
  for (const grp of Object.values(RANGES)) {
    const r = grp[m];
    if (r) {
      lo = Math.min(lo, r[0]);
      hi = Math.max(hi, r[1]);
    }
  }
  return Number.isFinite(lo) ? [lo, hi] : null;
}

export function lineOk(league: string | null | undefined, market: string | null | undefined, line: number | null | undefined): boolean {
  if (line == null) return true;
  const r = lineRange(league, market);
  return !r || (line >= r[0] - 1e-9 && line <= r[1] + 1e-9);
}

/** "1+", "2+ SOG", "3 +" → over 0.5 / 1.5 / 2.5. Null when the text is not that format. */
export function plusLine(text: string | null | undefined): number | null {
  const m = (text ?? "").match(/(?:^|[^\d.+-])(\d{1,3})\s?\+(?![\d])/);
  return m ? Number(m[1]) - 0.5 : null;
}

/** "Check this line: 22 looks off for shots on goal (usual 0.5–8.5)." */
export function lineIssue(league: string | null | undefined, market: string, line: number): string | null {
  if (lineOk(league, market, line)) return null;
  const r = lineRange(league, market)!;
  return `Check this line: ${line} looks off for ${market} (usual ${r[0]}–${r[1]}).`;
}

/**
 * Re-read a bad line from the slip text: the lines in this player's block, looking for "X+"
 * (over X-0.5) or a number in range that is not a jersey ("#22"), odds ("+150", "-110"),
 * a multiplier ("3x"), a time ("7:30") or a pick count ("5 picks"). Null when nothing fits.
 */
export function rereadLine(text: string, subject: string, league: string | null | undefined, market: string): { line: number; over: boolean } | null {
  const lines = text.split(/\n+/);
  const last = subject.trim().split(/\s+/).pop()?.toLowerCase() ?? "";
  if (last.length < 3) return null;
  const at = lines.findIndex((l) => l.toLowerCase().includes(last));
  if (at < 0) return null;
  const block: string[] = [];
  for (let i = at; i < Math.min(lines.length, at + 6); i++) {
    // Stop at the next player's name.
    if (i > at && /^[A-Z][a-z.'-]+\s+[A-Z][A-Za-z.'-]+$/.test(lines[i].trim()) && !lines[i].toLowerCase().includes(last)) break;
    block.push(lines[i]);
  }
  for (const l of block) {
    const p = plusLine(l);
    if (p != null && lineOk(league, market, p)) return { line: p, over: true };
  }
  for (const l of block) {
    const clean = l
      .replace(/#\s?\d+/g, " ")
      .replace(/(?:^|\s)[+-]\d{3,4}\b/g, " ")
      .replace(/\b\d+(?:\.\d+)?\s?x\b/gi, " ")
      .replace(/\b\d{1,2}:\d{2}\b/g, " ")
      .replace(/\b\d+\s*(?:picks?|legs?|players?|plays?|of)\b/gi, " ")
      .replace(/\$\s?\d+(?:\.\d+)?/g, " ");
    for (const t of clean.match(/\b\d{1,3}(?:\.\d)?\b/g) ?? []) {
      const n = Number(t);
      if (lineOk(league, market, n) && lineRange(league, market)) return { line: n, over: false };
    }
  }
  return null;
}
