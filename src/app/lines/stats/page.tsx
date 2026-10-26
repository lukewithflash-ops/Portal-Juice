import type { Metadata } from "next";
import PageHeader from "@/components/PageHeader";
import MyStatsClient from "@/components/MyStatsClient";
import { DoNotBetPanel } from "@/components/DoNotBet";

export const metadata: Metadata = { title: "My stats", description: "Your record from the Log. Wins, losses, pushes. Kept on this device." };

export default function MyStatsPage() {
  return (
    <>
      <PageHeader title="Stats" sub="Wins, losses, pushes. Yours only." />
      <MyStatsClient />
      <DoNotBetPanel />
    </>
  );
}
