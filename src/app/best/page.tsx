import type { Metadata } from "next";
import { FavoriteList, MoveList, MvpList, TrendList, BEST_NOTE } from "@/components/BestLists";
import { biggestMoves, hotTrends, marketFavorites } from "@/lib/best";
import { getMvpBoard, getSlate, getTrends } from "@/lib/espn";
import { PortalPickPanel } from "@/components/PortalPickPanel";
import { portalPickToday } from "@/lib/portalPickStore";
import { sportsDate } from "@/lib/slate";

export const revalidate = 60;

export const metadata: Metadata = {
  title: "Best",
  description: "Market favorites, line moves, hot players, and MVP prices, each with the numbers behind it. Ranked by the numbers. Not a guarantee.",
};

function Group({ title, how, children }: { title: string; how: string; children: React.ReactNode }) {
  return (
    <section className="mt-8 first:mt-0">
      <h2 className="text-sm font-black uppercase tracking-[0.18em] text-[color:var(--flat)]">{title}</h2>
      <p className="mt-0.5 mb-3 text-[12px] text-zinc-500">{how}</p>
      {children}
    </section>
  );
}

export default async function BestPage() {
  const [slate, trends, mvp] = await Promise.all([getSlate(), getTrends(), getMvpBoard()]);
  const favs = marketFavorites(slate.games);
  const moves = biggestMoves(slate.games);
  const hot = hotTrends(trends.trends);
  const portal = await portalPickToday(slate.games, sportsDate());
  return (
    <div className="mx-auto max-w-xl">
      <h1 className="text-2xl font-black tracking-tight text-[color:var(--flat)] sm:text-3xl">Best</h1>
      <p className="mt-1 text-sm text-zinc-400">{BEST_NOTE}</p>
      <p className="mt-2 mb-6 text-[12px] leading-snug text-zinc-500">
        Every row shows its homework: the posted price, the line move, or the game log behind the rank. Gold is #1 of each list.
        Green is a better number for that side, red is worse. Tap a row for the game.
      </p>

      <div className="mb-8">
        <PortalPickPanel pick={portal.pick} record={portal.record} tracked={portal.tracked} />
      </div>

      <Group title="Market favorites" how="Shorter moneyline turned into implied chance. Line move added when ESPN sent an open.">
        <FavoriteList rows={favs} />
      </Group>

      <Group title="Biggest moves" how="Open to now on totals and spreads. Only when ESPN sent both numbers.">
        <MoveList rows={moves} />
      </Group>

      <Group title="Hot players" how="Last 5 average above the longer average from the same ESPN game log. Sample sizes shown.">
        <TrendList rows={hot} />
      </Group>

      {mvp.groups.map((g) => (
        <Group key={g.league} title={`${g.leagueLabel} MVP board`} how={`${g.market} · ${g.provider}. Price turned into implied chance.`}>
          <MvpList rows={g.rows} provider={g.provider} />
        </Group>
      ))}
    </div>
  );
}
