/**
 * Book sync (SharpSports betSync), pure parts: flag rules, webhook HMAC check,
 * and turning a synced betSlip into slip rows our existing matcher understands.
 * Read-only: nothing here places a bet. Money fields (atRisk, toWin, netProfit, balance) are dropped.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { propMarketOf, type SlipRow } from "@/lib/slipImport";
import type { PickStatus } from "@/lib/types";
import { withPeriod, type PeriodCode } from "@/lib/periodStats";

export const SS_API = "https://api.sharpsports.io/v1";
export const SS_LINK_UI = "https://ui.sharpsports.io/link/";
/** Refreshes you can ask for, per linked book, per day (SharpSports also refreshes on its own). */
export const MANUAL_REFRESH_PER_DAY = 2;
export const BOOKSYNC_COOKIE = "pj_booksync";

export type SsBook = { id?: string; name?: string; abbr?: string };
export type SsBet = {
  id: string;
  type?: "straight" | "prop" | string;
  event?: { league?: string | null; name?: string | null; startTime?: string | null; startDate?: string | null; contestantAway?: { fullName?: string } | null; contestantHome?: { fullName?: string } | null } | null;
  proposition?: string | null;
  position?: string | null;
  line?: number | null;
  oddsAmerican?: number | null;
  outcome?: string | null;
  status?: string | null;
  segmentDetail?: string | null;
  segmentId?: string | null;
  bookDescription?: string | null;
  propDetails?: { player?: string | null; team?: string | null; metricSpecial?: string | null } | null;
};
export type SsBetSlip = {
  id: string;
  bettorAccount?: string;
  book?: SsBook;
  timePlaced?: string | null;
  type?: string;
  oddsAmerican?: number | null;
  status?: string;
  outcome?: string | null;
  bets?: SsBet[];
  // atRisk / toWin / netProfit exist on the wire. We never read or store them.
};

/** Flag: on for everyone with BOOKSYNC_ENABLED=1; otherwise only allowlisted ids, owners, or the test cookie. */
export function bookSyncOn(p: { env: string | undefined; allow: string | undefined; uid: string | null; owner: boolean; cookie: string | undefined }): boolean {
  if (p.env === "1" || p.env === "true") return true;
  if (p.owner) return true;
  if (p.cookie === "1") return true;
  if (!p.uid) return false;
  return (p.allow ?? "").split(",").map((s) => s.trim()).filter(Boolean).includes(p.uid);
}

/** base64(HMAC-SHA256(secret, raw body)) compared in constant time. */
export function verifyHmac(raw: string, header: string | null | undefined, secret: string | undefined): boolean {
  if (!secret || !header) return false;
  const a = Buffer.from(createHmac("sha256", secret).update(raw, "utf8").digest("base64"));
  const b = Buffer.from(header.trim());
  return a.length === b.length && timingSafeEqual(a, b);
}

export function outcomeStatus(o: string | null | undefined, status?: string | null): PickStatus {
  const v = (o ?? "").toLowerCase();
  if (v === "win" || v === "won") return "win";
  if (v === "loss" || v === "lose" || v === "lost") return "loss";
  if (v === "push" || v === "void" || v === "cancelled" || v === "canceled" || v === "refund") return "push";
  return status === "completed" && v === "draw" ? "push" : "open";
}

const LEAGUES: Record<string, string> = { nfl: "nfl", ncaaf: "ncaaf", cfb: "ncaaf", nba: "nba", wnba: "wnba", ncaab: "ncaam", ncaam: "ncaam", cbb: "ncaam", ncaaw: "ncaaw", mlb: "mlb", nhl: "nhl", atp: "atp", wta: "wta" };
export const leagueOf = (l: string | null | undefined) => (l ? LEAGUES[l.toLowerCase().replace(/[^a-z]/g, "")] ?? null : null);

/** "2nd Quarter" / "1st Half" / SEGM_Q2 → our period code written into the market text ("2Q", "1H"). */
export function periodWords(b: SsBet): PeriodCode | null {
  const s = `${b.segmentDetail ?? ""} ${b.segmentId ?? ""}`.toLowerCase();
  const q = s.match(/(?:\b([1-4])(?:st|nd|rd|th)?\s*quarter\b|segm_q([1-4]))/);
  if (q) return `${q[1] ?? q[2]}Q` as PeriodCode;
  const h = s.match(/(?:\b([12])(?:st|nd)?\s*half\b|segm_h([12]))/);
  if (h) return `${h[1] ?? h[2]}H` as PeriodCode;
  return null;
}

/** One synced bet → one slip row. The stat words go through our normal stat parser/matcher downstream. */
export function rowFromBet(b: SsBet): SlipRow {
  const league = leagueOf(b.event?.league);
  const date = b.event?.startDate ?? (b.event?.startTime ? b.event.startTime.slice(0, 10) : null);
  const pos = (b.position ?? "").trim();
  const sel: "Over" | "Under" | null = /^over\b/i.test(pos) ? "Over" : /^under\b/i.test(pos) ? "Under" : null;
  const prop = (b.proposition ?? "").toLowerCase();
  const per = periodWords(b);
  const odds = typeof b.oddsAmerican === "number" ? b.oddsAmerican : null;
  const base = { league, date, odds, settled: (b.status ?? "") === "completed", period: per };
  const pd = b.propDetails;
  if (b.type === "prop" && (pd?.player || pd?.team)) {
    const metric = propMarketOf(pd.metricSpecial || prop) || pd.metricSpecial || prop;
    return { ...base, kind: "prop", subject: (pd.player || pd.team)!, market: withPeriod(metric, per), line: b.line ?? null, selection: sel ?? "Over" };
  }
  const home = b.event?.contestantHome?.fullName ?? null;
  const away = b.event?.contestantAway?.fullName ?? null;
  if (prop === "total") return { ...base, kind: "total", subject: away && home ? `${away} @ ${home}` : b.event?.name ?? pos, market: "total", line: b.line ?? null, selection: sel, team: away, opponent: home };
  const kind = prop === "spread" ? "spread" : "moneyline";
  const opp = pos && home && pos === home ? away : home;
  return { ...base, kind, subject: pos || (b.event?.name ?? "Pick"), market: kind, line: kind === "spread" ? (b.line ?? null) : null, selection: null, team: pos || null, opponent: opp };
}

/** Pick ids are stable per synced bet, so a re-import updates the same rows (dedupe on the betSlip id). */
export const syncSlipId = (slipId: string) => `ss:${slipId}`.slice(0, 60);
export const syncPickId = (slipId: string, i: number) => `ss_${slipId.replace(/^SLIP_/, "")}_${i}`.slice(0, 80);

/** UTC day key for the manual refresh limit. */
export const dayKey = (now = Date.now()) => new Date(now).toISOString().slice(0, 10);

export type SsEvent = { event?: string; sender?: string; data?: Record<string, unknown> };
export type WebhookAction = { kind: "linked" | "refreshed" | "relink" | "ignore"; bettor: string | null; account: string | null; book: string | null; slips: SsBetSlip[] };

/** Map a SharpSports webhook to what we do with it. */
export function webhookAction(e: SsEvent): WebhookAction {
  const d = (e.data ?? {}) as Record<string, unknown>;
  const ev = String(e.event ?? "").toLowerCase();
  const bettor = typeof d.bettor === "string" ? d.bettor : null;
  const book = typeof d.book === "string" ? d.book : d.book && typeof d.book === "object" ? String((d.book as SsBook).name ?? (d.book as SsBook).abbr ?? "") || null : null;
  const accountOf = (k: string) => (typeof d[k] === "string" ? (d[k] as string) : null);
  if (ev === "bettoraccount.verified" || ev === "bettoraccount.created") return { kind: "linked", bettor, account: accountOf("id"), book, slips: [] };
  if (ev === "bettoraccount.unverified") return { kind: "relink", bettor, account: accountOf("id"), book, slips: [] };
  if (ev === "refreshresponse.created") return { kind: "refreshed", bettor, account: accountOf("bettorAccount"), book, slips: Array.isArray(d.betSlips) ? (d.betSlips as SsBetSlip[]).filter((s) => s && typeof s.id === "string") : [] };
  return { kind: "ignore", bettor, account: null, book, slips: [] };
}
