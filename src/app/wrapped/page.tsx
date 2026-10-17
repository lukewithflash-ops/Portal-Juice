import type { Metadata } from "next";
import WrappedStory from "@/components/Wrapped";

export const metadata: Metadata = { title: "Portal Wrapped", description: "Your week in the Log: record, best hit, streaks, hottest stat and league." };

export default function Page() {
  return (
    <>
      <h1 className="text-2xl font-black tracking-tight text-[color:var(--flat)] sm:text-3xl">Portal Wrapped</h1>
      <p className="mt-1 mb-4 text-sm text-zinc-400">The last 7 days from your Log. Wins, losses and pushes only.</p>
      <WrappedStory />
    </>
  );
}
