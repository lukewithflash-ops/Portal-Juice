import type { Metadata } from "next";
import PageHeader from "@/components/PageHeader";
import PickemClient from "@/components/PickemClient";

export const metadata: Metadata = { title: "Game Day Pick-em", description: "Pick today's winners with friends. Bragging rights and coins. No money." };

export default function PickemPage() {
  return (
    <>
      <PageHeader title="Game Day Pick-em" sub="Pick winners before tip-off. Leaderboard resets daily, weekly totals roll up." note="Free to play. Bragging rights and cosmetic coins only. No money, no wagering." />
      <PickemClient />
    </>
  );
}
