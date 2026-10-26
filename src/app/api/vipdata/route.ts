import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { vipState } from "@/lib/vipAccess";
import { activeSeasons, defaultSeason, DK_SPLITS_URL, leagueOut, teamOut, todayMatchups } from "@/lib/teamData";
import { TD_LEAGUES, tdLeague } from "@/lib/teamDataCore";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const SOURCES = {
  results: "ESPN finals and linescores (site.api.espn.com)",
  lines: "DraftKings closing lines via ESPN odds feed (provider: DraftKings)",
  splits: { label: "DraftKings Network public betting splits", url: DK_SPLITS_URL },
};

/** VIP Data. Non-VIP get a locked teaser with counts only. */
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const lg = q.get("lg") ?? "nfl";
  const c = tdLeague(lg);
  if (!c) return NextResponse.json({ error: "league" }, { status: 400 });
  const seasons = activeSeasons(c).map((s) => ({ key: s.key, label: s.label }));
  const season = q.get("season") && seasons.some((s) => s.key === q.get("season")) ? q.get("season")! : await defaultSeason(lg);
  const leagues = TD_LEAGUES.map((l) => ({ id: l.id, label: l.label }));
  const out = season ? await leagueOut(lg, season) : null;
  const u = await currentUser();
  const vip = (await vipState(u)).vip;
  const head = { leagues, league: lg, seasons, season, sources: SOURCES, games: out?.games ?? 0, withLines: out?.withLines ?? 0, at: out?.at ?? null, first: out?.first ?? null, last: out?.last ?? null };
  const h = { headers: { "cache-control": "private, no-store" } };
  if (!vip) return NextResponse.json({ ...head, locked: true, teams: out?.teams.length ?? 0, boardTitles: out?.boards.map((b) => b.title) ?? [] }, h);
  const team = q.get("team");
  if (team && season) return NextResponse.json({ ...head, locked: false, team: await teamOut(lg, season, team) }, h);
  if (q.get("view") === "today" && season) return NextResponse.json({ ...head, locked: false, today: await todayMatchups(lg, season) }, h);
  return NextResponse.json({ ...head, locked: false, boards: out?.boards ?? [], teams: out?.teams ?? [] }, h);
}
