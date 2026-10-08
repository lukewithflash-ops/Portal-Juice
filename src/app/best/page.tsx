import type { Metadata } from "next";
import { FavoriteList, MoveList, MvpList, TrendList, BEST_NOTE } from "@/components/BestLists";
import { biggestMoves, hotTrends, marketFavorites } from "@/lib/best";
import { getMvpBoard, getTrends } from "@/lib/espn";
import { getSlate } from "@/lib/espn";

export const revalidate = 60;

export const metadata: Metadata = {
  title: "Best",
  description: "Market favorites, line moves, trends, and MVP prices. Ranked by the numbers. Not a guarantee.",
};

export default async function BestPage() {
  const [slate, trends, mvp] = await Promise.all([getSlate(), getTrends(), getMvpBoard()]);
  const favs = marketFavorites(slate.games);
  const moves = biggestMoves(slate.games);
  const hot = hotTrends(trends.trends);
  return (
    <>
      <h1 className="text-2xl font-black tracking-tight text-[color:var(--flat)] sm:text-3xl">Best</h1>
      <p className="mt-1 mb-5 text-sm text-zinc-400">{BEST_NOTE}</p>
      <p className="mb-6 text-[11px] text-zinc-500">
        Green is up or above the season line. Gold marks the top of each list. Red is down or below.
      </p>

      <section>
        <h2 className="mb-2 text-xs font-bold uppercase tracking-[0.22em] text-purple-200/80">Market favorites</h2>
        <p className="mb-2 text-[11px] text-zinc-500">Shorter moneyline by implied chance. {BEST_NOTE}</p>
        <FavoriteList rows={favs} />
      </section>

      <section className="mt-8">
        <h2 className="mb-2 text-xs font-bold uppercase tracking-[0.22em] text-purple-200/80">Line movement</h2>
        <p className="mb-2 text-[11px] text-zinc-500">Open to current, only when ESPN sent both.</p>
        <MoveList rows={moves} />
      </section>

      <section className="mt-8">
        <h2 className="mb-2 text-xs font-bold uppercase tracking-[0.22em] text-purple-200/80">Hot trends</h2>
        <p className="mb-2 text-[11px] text-zinc-500">Last 5 minus the season average from the same log.</p>
        <TrendList rows={hot} />
      </section>

      {mvp.groups.map((g) => (
        <section key={g.league} className="mt-8">
          <h2 className="mb-2 text-xs font-bold uppercase tracking-[0.22em] text-purple-200/80">
            {g.leagueLabel} MVP
          </h2>
          <p className="mb-2 text-[11px] text-zinc-500">{g.market} · {g.provider}</p>
          <MvpList rows={g.rows} provider={g.provider} />
        </section>
      ))}
    </>
  );
}
