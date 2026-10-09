import type { Metadata } from "next";
import GamesBoard from "@/components/GamesBoard";
import SportsBoard from "@/components/SportsBoard";
import { getSlate } from "@/lib/espn";

export const revalidate = 15;

export const metadata: Metadata = {
  title: "Games",
  description: "Today's games, totals, spreads, and moneylines. Prices only when a provider posted them.",
};

export default async function GamesPage() {
  const slate = await getSlate();
  return (
    <>
      <h1 className="text-2xl font-black tracking-tight text-[color:var(--flat)] sm:text-3xl">Games</h1>
      <p className="mt-1 mb-5 text-sm text-zinc-400">
        Schedule, score, and the number when ESPN has one. Times are on your phone.
      </p>
      <GamesBoard games={slate.games} fetchedAt={slate.fetchedAt} dayLabel={slate.dayLabel} missing={slate.missing} />
      <SportsBoard />
    </>
  );
}
