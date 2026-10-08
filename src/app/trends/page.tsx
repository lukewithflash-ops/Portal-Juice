import type { Metadata } from "next";
import Mark from "@/components/Mark";
import { getTrends } from "@/lib/espn";
import { PAST_HITS } from "@/lib/site";
import { ptTime } from "@/lib/time";

export const revalidate = 60;

export const metadata: Metadata = {
  title: "Trends",
  description: "Recent stat averages for players in today's games. Past results are not a pick.",
};

export default async function TrendsPage() {
  const { trends, fetchedAt } = await getTrends();
  return (
    <>
      <h1 className="text-2xl font-black tracking-tight text-[color:var(--flat)] sm:text-3xl">Trends</h1>
      <p className="mt-1 text-sm text-zinc-400">
        Last-5 averages from ESPN gamelogs for players leading a category on a team playing today.
      </p>
      <p className="mt-1 mb-5 text-[11px] text-zinc-500">Updated {ptTime(fetchedAt)}. {PAST_HITS}</p>
      {trends.length === 0 ? (
        <p className="panel rounded-xl px-4 py-5 text-sm text-zinc-400">
          No player logs from ESPN for today’s games yet.
        </p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {trends.map((t) => (
            <li key={t.id} className="foil-tile flex items-center gap-3 p-3">
              <Mark team={t.team} headshotUrl={t.headshot} label={t.name} size={48} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-bold text-[color:var(--flat)]">{t.name}</div>
                <div className="truncate text-[11px] text-zinc-400">
                  {t.team} · {t.leagueLabel} · {t.matchup}
                </div>
                <p className="mt-1 text-sm text-zinc-200">
                  Avg <span className="big-num text-2xl font-black text-[color:var(--flat)]">{t.avg}</span>{" "}
                  {t.statLabel}, last {t.games}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-4 text-[11px] text-zinc-500">{PAST_HITS}</p>
    </>
  );
}
