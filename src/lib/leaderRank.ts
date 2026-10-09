/** Pure ranking for the opt-in leaderboard. No money fields exist here by design. */

export const LEADER_MIN = 8;
export const LEADER_NOTE = "Past hits are not a pick.";

export type Leg = {
  sport: string;
  subject: string;
  market: string;
  line: number;
  selection: "Over" | "Under" | null;
  status: "open" | "win" | "loss" | "push";
  date: string;
  league?: string;
  gameId?: string;
};

export type Published = { handle: string; legs: Leg[]; updatedAt: string };

export type LeaderRow = {
  handle: string;
  wins: number;
  losses: number;
  pushes: number;
  sample: number;
  hitRate: number;
  open: Leg[];
  updatedAt: string;
};

const STATUS = new Set(["open", "win", "loss", "push"]);

function str(v: unknown, max: number): string {
  return typeof v === "string" ? v.replace(/[\u0000-\u001f<>]/g, "").trim().slice(0, max) : "";
}

/** Keeps only line fields. Stakes, odds, books, and anything else are dropped. */
export function cleanLeg(raw: unknown): Leg | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const subject = str(r.subject, 80);
  const line = Number(r.line);
  const status = str(r.status, 8);
  if (!subject || !Number.isFinite(line) || !STATUS.has(status)) return null;
  const sel = r.selection === "Over" || r.selection === "Under" ? r.selection : null;
  const league = str(r.league, 12);
  const gameId = str(r.gameId, 16);
  return {
    sport: str(r.sport, 12),
    subject,
    market: str(r.market, 40),
    line,
    selection: sel,
    status: status as Leg["status"],
    date: /^\d{4}-\d{2}-\d{2}$/.test(str(r.date, 10)) ? str(r.date, 10) : "",
    ...(league && /^[a-z]+$/.test(league) ? { league } : {}),
    ...(gameId && /^\d+$/.test(gameId) ? { gameId } : {}),
  };
}

export function cleanLeaderHandle(raw: unknown): string | null {
  const s = typeof raw === "string" ? raw.trim().replace(/^@/, "") : "";
  return /^[A-Za-z0-9_]{3,20}$/.test(s) ? s : null;
}

/** Hit rate = wins / (wins + losses). Pushes do not count. Under LEADER_MIN graded lines: not listed. */
export function rankLeaders(all: Published[]): LeaderRow[] {
  const rows: LeaderRow[] = [];
  for (const p of all) {
    const wins = p.legs.filter((l) => l.status === "win").length;
    const losses = p.legs.filter((l) => l.status === "loss").length;
    const pushes = p.legs.filter((l) => l.status === "push").length;
    const sample = wins + losses;
    if (sample < LEADER_MIN) continue;
    rows.push({
      handle: p.handle,
      wins,
      losses,
      pushes,
      sample,
      hitRate: Math.round((wins / sample) * 1000) / 10,
      open: p.legs.filter((l) => l.status === "open").slice(0, 20),
      updatedAt: p.updatedAt,
    });
  }
  rows.sort((a, b) => b.hitRate - a.hitRate || b.sample - a.sample);
  return rows.slice(0, 50);
}
