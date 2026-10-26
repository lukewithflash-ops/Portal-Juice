import type { Metadata } from "next";
import PageHeader from "@/components/PageHeader";
import VipDataClient from "@/components/VipDataClient";

export const metadata: Metadata = { title: "VIP Data", description: "Team records straight-up, against the spread and over/under from real finals and DraftKings closing lines." };

export default async function Page({ searchParams }: { searchParams: Promise<{ lg?: string }> }) {
  const { lg } = await searchParams;
  return (
    <>
      <PageHeader title="💎 VIP Data" sub="Spreads, moneylines, totals and trends from real finals." />
      <VipDataClient initialLeague={lg ?? "nfl"} />
    </>
  );
}
