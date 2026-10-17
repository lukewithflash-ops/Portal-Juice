import type { Metadata } from "next";
import PageHeader from "@/components/PageHeader";
import AskPage from "@/components/AskPage";

export const metadata: Metadata = { title: "Ask Portal AI", description: "Ask about games, players, and how Portal Juice works. Real numbers, no guarantees." };

export default function Page() {
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Ask Portal AI" sub="Games, players, the app. ESPN numbers only." />
      <AskPage />
    </div>
  );
}
