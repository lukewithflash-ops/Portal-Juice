import { SPORT_ORDER, type Sport } from "@/lib/types";
import type { PosLeg } from "@/lib/positionsClient";

/** A position someone chose to post in chat: 1–8 legs from their Log. Live values are never stored; viewers pull them. */
export type SharedPos = { legs: PosLeg[] };

const str = (v: unknown, n: number) => (typeof v === "string" ? v.replace(/[\u0000-\u001f]/g, "").replace(/\s+/g, " ").trim().slice(0, n) : "");

export function cleanPos(p: unknown, textOk: (s: string) => boolean = () => true): SharedPos | undefined {
  const legs = (p as { legs?: unknown })?.legs;
  if (!Array.isArray(legs) || !legs.length) return undefined;
  const out: PosLeg[] = [];
  for (const raw of legs.slice(0, 8)) {
    const o = (raw ?? {}) as Record<string, unknown>;
    const subject = str(o.subject, 60);
    const line = Number(o.line);
    if (!subject || !Number.isFinite(line) || !textOk(subject)) continue;
    const market = str(o.market, 30) || null;
    if (market && !textOk(market)) continue;
    const sport = SPORT_ORDER.includes(o.sport as Sport) ? (o.sport as Sport) : undefined;
    const league = /^[a-z0-9.-]{2,24}$/i.test(String(o.league ?? "")) ? String(o.league).toLowerCase() : null;
    const gameId = /^[A-Za-z0-9_-]{1,40}$/.test(String(o.gameId ?? "")) ? String(o.gameId) : null;
    const status = ["open", "win", "loss", "push"].includes(String(o.status)) ? String(o.status) : "open";
    out.push({
      id: str(o.id, 40) || crypto.randomUUID(), subject, line, market,
      selection: o.selection === "Over" || o.selection === "Under" ? o.selection : null,
      league, gameId, status, date: str(o.date, 10), slipId: null, createdAt: str(o.createdAt, 30), sport, plus: o.plus === true || undefined,
    });
  }
  return out.length ? { legs: out } : undefined;
}
