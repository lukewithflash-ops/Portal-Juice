import type { Metadata } from "next";
import MyStatsClient from "@/components/MyStatsClient";

export const metadata: Metadata = { title: "My stats", description: "Your record from the Log. Wins, losses, pushes. Kept on this device." };

export default function MyStatsPage() {
  return (
    <>
      <h1 className="text-2xl font-black tracking-tight text-[color:var(--flat)] sm:text-3xl">My stats</h1>
      <p className="mt-1 mb-5 text-sm text-zinc-400">Your record. Wins, losses, pushes. On this device only.</p>
      <MyStatsClient />
    </>
  );
}
