import type { Metadata } from "next";
import QuestsPage from "@/components/Quests";

export const metadata: Metadata = { title: "Daily quests", description: "Three small goals a day that light up your streak." };

export default function Page() {
  return (
    <>
      <h1 className="text-2xl font-black tracking-tight text-[color:var(--flat)] sm:text-3xl">Daily quests</h1>
      <p className="mt-1 mb-5 text-sm text-zinc-400">Three small goals a day. Finish them to light the header, earn badges and unlock neon emotes.</p>
      <QuestsPage />
    </>
  );
}
