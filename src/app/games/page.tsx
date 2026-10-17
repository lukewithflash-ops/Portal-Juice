import type { Metadata } from "next";
import PageHeader from "@/components/PageHeader";
import GamesBoard from "@/components/GamesBoard";
import { getSlate } from "@/lib/espn";
import NextSlate from "@/components/NextSlate";
import { nextSlate } from "@/lib/nextSlateServer";

export const revalidate = 15;

export const metadata: Metadata = {
  title: "Games",
  description: "Today's games, totals, spreads, and moneylines. Prices only when a provider posted them.",
};

export default async function GamesPage() {
  const slate = await getSlate();
  const next = await nextSlate(slate).catch(() => null);
  return (
    <>
      <PageHeader title="Games" sub="Scores and the number, from ESPN." />
      {next ? <NextSlate label={next.label} games={next.games} /> : null}
      <GamesBoard games={slate.games} fetchedAt={slate.fetchedAt} dayLabel={slate.dayLabel} missing={slate.missing} />
    </>
  );
}
