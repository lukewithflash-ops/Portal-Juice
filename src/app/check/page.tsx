import type { Metadata } from "next";
import { Suspense } from "react";
import CheckClient from "@/components/CheckClient";

export const metadata: Metadata = {
  title: "Breakdown",
  description: "Check a pick or a parlay against real ESPN numbers. Pros, cons and the stats behind them.",
};

export default function CheckPage() {
  return (
    <>
      <h1 className="text-2xl font-black tracking-tight text-[color:var(--flat)] sm:text-3xl">Breakdown</h1>
      <p className="mt-1 mb-5 text-sm text-zinc-400">
        Check a leg or a parlay. Every pro and con comes from ESPN numbers shown below it.
      </p>
      <Suspense fallback={<p className="text-sm text-zinc-500">Loading the slate…</p>}>
        <CheckClient />
      </Suspense>
    </>
  );
}
