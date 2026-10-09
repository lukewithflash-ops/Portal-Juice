/** Projected win chance per side. Only from ESPN or the posted moneyline. Never invented. */
import { impliedFromAmerican } from "@/lib/chance";

export type WinSource = "live" | "espn" | "moneyline";
export type WinPct = { home: number; away: number; draw: number | null; source: WinSource; label: string };

export const WIN_LABEL: Record<WinSource, string> = {
  live: "ESPN win probability, live",
  espn: "ESPN projection",
  moneyline: "From the moneyline, vig removed",
};

const amer = (v: string | number | null | undefined): number | null => {
  if (v == null) return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(/^\+/, ""));
  return Number.isFinite(n) && Math.abs(n) >= 100 ? n : null;
};

const r1 = (x: number) => Math.round(x * 1000) / 10;

/** No-vig split from American prices. Two-way, or three-way with a draw. Null unless every needed price exists. */
export function noVig(homeMl: string | number | null | undefined, awayMl: string | number | null | undefined, drawMl?: string | number | null): { home: number; away: number; draw: number | null } | null {
  const h = impliedFromAmerican(amer(homeMl));
  const a = impliedFromAmerican(amer(awayMl));
  if (h == null || a == null) return null;
  const d = drawMl != null ? impliedFromAmerican(amer(drawMl)) : null;
  if (drawMl != null && d == null) return null;
  const sum = h + a + (d ?? 0);
  if (!(sum > 0)) return null;
  return { home: r1(h / sum), away: r1(a / sum), draw: d != null ? r1(d / sum) : null };
}

/**
 * Order: live ESPN win probability (in game), ESPN pregame projection, then the moneyline with the vig removed.
 * Finals get nothing. Inputs in percent (0–100) for ESPN, except liveHome which ESPN sends as 0–1.
 */
export function winPct(o: {
  state: "pre" | "in" | "post";
  liveHome?: number | null;
  projection?: { home: number; away: number } | null;
  homeMl?: string | number | null;
  awayMl?: string | number | null;
  drawMl?: string | number | null;
}): WinPct | null {
  if (o.state === "post") return null;
  if (o.state === "in" && o.liveHome != null && Number.isFinite(o.liveHome) && o.liveHome >= 0 && o.liveHome <= 1) {
    const home = r1(o.liveHome);
    return { home, away: Math.round((100 - home) * 10) / 10, draw: null, source: "live", label: WIN_LABEL.live };
  }
  if (o.state === "pre" && o.projection && o.projection.home + o.projection.away > 90 && o.projection.home + o.projection.away < 110) {
    const s = o.projection.home + o.projection.away;
    const home = Math.round((o.projection.home / s) * 1000) / 10;
    return { home, away: Math.round((100 - home) * 10) / 10, draw: null, source: "espn", label: WIN_LABEL.espn };
  }
  if (o.state === "pre") {
    const nv = noVig(o.homeMl, o.awayMl, o.drawMl);
    if (nv) return { ...nv, source: "moneyline", label: WIN_LABEL.moneyline };
  }
  return null;
}
