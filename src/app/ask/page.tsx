import type { Metadata } from "next";
import AskPage from "@/components/AskPage";

export const metadata: Metadata = { title: "Ask Portal AI", description: "Ask about games, players, and how Portal Juice works. Real numbers, no guarantees." };

export default function Page() {
  return (
    <div className="mx-auto max-w-2xl space-y-3 px-3 py-4">
      <h1 className="text-2xl font-black text-white">Ask Portal AI</h1>
      <p className="text-sm text-zinc-400">Game questions, player numbers, and site help. Every number comes from ESPN tools.</p>
      <AskPage />
    </div>
  );
}
