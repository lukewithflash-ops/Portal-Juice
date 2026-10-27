import "server-only";
import { getGameDetail } from "@/lib/espn";
import { portalPickHistory } from "@/lib/portalPickStore";
import { defaultSeason, dkSplits, moneyEvent, teamOut } from "@/lib/teamData";
import { sideTeam, splitTrend, tdLeague, type DkSplitEvent, type MlEvent } from "@/lib/teamDataCore";
import { vipHistory } from "@/lib/vipStore";
import { findSplits, marketKind, moveToward, similarRecord, trendOf, whyInjuries, type Move, type SimPick, type SimRow, type Trend, type WhyInjury } from "@/lib/whyCore";

export type WhySplit = { market: string; rows: { side: string; handle: number; bets: number }[]; rlm: string | null; trend: string | null };
export type Why = {
  league: string;
  home: string;
  away: string;
  state: string;
  injuries: WhyInjury[];
  move: Move | null;
  provider: string | null;
  splits: WhySplit[] | null;
  splitsAt: string | null;
  trends: Trend[] | null;
  similar: SimRow[];
  locked: boolean;
};

const day = (iso: string) => Date.parse(new Date(iso).toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" }) + "T00:00:00Z") / 86400000;

export async function simPicks(): Promise<SimPick[]> {
  const [vip, portal] = await Promise.all([vipHistory().catch(() => []), portalPickHistory().catch(() => [])]);
  const out: SimPick[] = [];
  for (const p of vip) {
    if (!p.result) continue;
    const side = p.leg.side;
    const team = side === "home" ? p.home : side === "away" ? p.away : null;
    const fav = p.kind === "spread" ? (p.leg.line ?? 0) < 0 : p.kind === "moneyline" ? (p.odds ?? 0) < 0 : null;
    out.push({ league: p.league, kind: p.kind as SimPick["kind"], team, home: p.home, away: p.away, atHome: side ? side === "home" : null, fav, num: p.kind === "spread" && p.leg.line != null ? Math.abs(p.leg.line) : null, result: p.result === "win" ? "W" : p.result === "loss" ? "L" : "P" });
  }
  for (const p of portal) {
    if (!p.result) continue;
    const atHome = p.kind === "spread" ? p.side === p.homeAbbr : null;
    out.push({ league: p.league, kind: p.kind, team: p.kind === "spread" ? p.side : null, home: p.homeAbbr, away: p.awayAbbr, atHome, fav: p.kind === "spread" ? p.line < 0 : null, num: p.kind === "spread" ? Math.abs(p.line) : null, result: p.result === "hit" ? "W" : p.result === "miss" ? "L" : "P" });
  }
  return out;
}

function splitView(ev: DkSplitEvent | null, move: Move | null, hist: MlEvent | null): WhySplit[] | null {
  if (!ev) return null;
  return ev.markets.map((m) => {
    const k = marketKind(m.name);
    const rows = m.rows.map((r) => ({ side: r.side, handle: r.handle, bets: r.bets }));
    let rlm: string | null = null;
    if (k && rows.length === 2 && !rows.some((r) => r.handle >= 100)) {
      const top = rows[0].handle >= rows[1].handle ? 0 : 1;
      const who = sideTeam(rows[top].side, ev);
      const leg = k === "total" ? { kind: k, pick: /^under/i.test(rows[top].side) ? ("under" as const) : ("over" as const) } : who ? { kind: k, side: who } : null;
      const mv = leg ? moveToward(leg, move) : null;
      if (mv != null && rows[top].handle >= 60 && mv <= -0.5) rlm = `Reverse line move: ${rows[top].handle}% of money on ${rows[top].side}, line moved the other way`;
    }
    return { market: m.name, rows, rlm, trend: hist ? splitTrend(hist, m.name)?.text ?? null : null };
  });
}

export async function buildWhy(league: string, id: string, vip: boolean): Promise<Why | null> {
  const b = await getGameDetail(league, id).catch(() => null);
  if (!b) return null;
  const g = b.game;
  const p = g.price;
  const move: Move | null = p ? { spreadHome: p.spreadHome, spreadHomeOpen: p.spreadHomeOpen, total: p.total, totalOpen: p.totalOpen } : null;
  const injuries = whyInjuries(b.detail.injuries, b.detail.leaders);
  const cfg = tdLeague(league);
  const [sp, sims, season] = await Promise.all([cfg ? dkSplits(league) : null, simPicks(), cfg ? defaultSeason(league).catch(() => null) : null]);
  const similar = similarRecord(sims, { league, home: g.home.abbr, away: g.away.abbr, spreadHome: p?.spreadHome ?? null, lg: g.leagueLabel });
  const base = { league, home: g.home.abbr, away: g.away.abbr, state: g.state, injuries, move, provider: p?.provider ?? null, similar };
  if (!vip) return { ...base, splits: null, splitsAt: null, trends: null, locked: true };
  const ev = sp ? findSplits(sp.events, { homeAbbr: g.home.abbr, awayAbbr: g.away.abbr, homeName: g.home.name, awayName: g.away.name }) : null;
  const hist = ev?.id ? await moneyEvent(league, ev.id) : null;
  let trends: Trend[] | null = null;
  if (cfg && season) {
    const [hs, as] = await Promise.all([teamOut(league, season, g.home.abbr).catch(() => null), teamOut(league, season, g.away.abbr).catch(() => null)]);
    const rest = (t: typeof hs) => (t?.recent?.[0]?.d ? Math.round(day(g.start) - day(t.recent[0].d)) : null);
    trends = [as ? trendOf(as, false, rest(as)) : null, hs ? trendOf(hs, true, rest(hs)) : null].filter((x): x is Trend => !!x);
    if (!trends.length) trends = null;
  }
  return { ...base, splits: splitView(ev, move, hist), splitsAt: ev ? sp?.at ?? null : null, trends, locked: false };
}
