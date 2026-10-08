import "server-only";
import { allowedHeadshot } from "@/lib/headshots";
import { SPORT_ORDER, type LineRow, type LinesSnapshot, type Print, type Sport } from "@/lib/types";

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const isStr = (v: unknown): v is string => typeof v === "string" && v.length > 0;

/** Nothing connected → nothing rendered. No seeded or sample rows, ever. */
export const EMPTY_SNAPSHOT: LinesSnapshot = {
  pulledAt: new Date(0).toISOString(),
  previousPull: "previous print",
  source: null,
  rows: [],
};

function sanitizePrints(v: unknown): Print[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter(
      (p): p is Print =>
        !!p && typeof p === "object" && isStr((p as Print).at) && isNum((p as Print).line) && isNum((p as Print).juice)
    )
    .map((p) => ({ at: p.at, line: p.line, juice: Math.round(p.juice) }))
    .slice(-50);
}

/** Validate one feed row. Rows that break the contract are dropped, not patched. */
export function sanitizeRow(raw: unknown): LineRow | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const sport = String(r.sport ?? "").toUpperCase() as Sport;
  if (!SPORT_ORDER.includes(sport)) return null;
  if (r.kind !== "prop" && r.kind !== "side") return null;
  if (!isStr(r.id) || !isStr(r.subject) || !isStr(r.team) || !isStr(r.opponent)) return null;
  if (!isStr(r.market) || !isNum(r.line) || !isNum(r.juice) || !isStr(r.book)) return null;
  if (!isStr(r.startsAt) || !isStr(r.updatedAt)) return null;
  const selection = r.selection === "Over" || r.selection === "Under" ? r.selection : null;
  return {
    id: r.id,
    sport,
    kind: r.kind,
    subject: r.subject,
    team: r.team.toUpperCase(),
    opponent: r.opponent.toUpperCase(),
    home: r.home === true,
    market: r.market,
    selection,
    line: r.line,
    prevLine: isNum(r.prevLine) ? r.prevLine : null,
    juice: Math.round(r.juice),
    prevJuice: isNum(r.prevJuice) ? Math.round(r.prevJuice) : null,
    book: r.book,
    startsAt: r.startsAt,
    headshotUrl: allowedHeadshot(typeof r.headshotUrl === "string" ? r.headshotUrl : null),
    updatedAt: r.updatedAt,
    prints: sanitizePrints(r.prints),
  };
}

/**
 * Current board. Only a real feed (LINES_FEED_URL, JSON shaped like
 * LinesSnapshot) produces rows. No feed, a failed pull, or a bad payload →
 * empty board. The odds vendor is not chosen yet.
 */
export async function getSnapshot(): Promise<LinesSnapshot> {
  const url = process.env.LINES_FEED_URL;
  if (!url) return EMPTY_SNAPSHOT;
  try {
    const res = await fetch(url, {
      headers: process.env.LINES_FEED_TOKEN
        ? { Authorization: `Bearer ${process.env.LINES_FEED_TOKEN}` }
        : undefined,
      next: { revalidate: 30 },
    });
    if (!res.ok) return EMPTY_SNAPSHOT;
    const body = (await res.json()) as Partial<LinesSnapshot>;
    const rows = Array.isArray(body.rows)
      ? body.rows.map(sanitizeRow).filter((r): r is LineRow => r !== null)
      : [];
    return {
      pulledAt: isStr(body.pulledAt) ? body.pulledAt : new Date().toISOString(),
      previousPull: isStr(body.previousPull) ? body.previousPull : "previous print",
      source: isStr(body.source) ? body.source : "feed",
      rows,
    };
  } catch {
    return EMPTY_SNAPSHOT;
  }
}
