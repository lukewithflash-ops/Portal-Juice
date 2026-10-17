import type { Metadata } from "next";
import PageHeader from "@/components/PageHeader";
import { SkelRows } from "@/components/Skeleton";
import { Suspense } from "react";
import CheckClient from "@/components/CheckClient";

export const metadata: Metadata = {
  title: "Breakdown",
  description: "Check a pick or a parlay against real ESPN numbers. Pros, cons and the stats behind them.",
};

export default function CheckPage() {
  return (
    <>
      <PageHeader title="Breakdown" sub="Check a leg or parlay. Every point cites ESPN." />
      <Suspense fallback={<SkelRows n={3} label="Loading the slate" />}>
        <CheckClient />
      </Suspense>
    </>
  );
}
