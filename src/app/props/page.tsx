import type { Metadata } from "next";
import { getPropsBoard } from "@/lib/espn";
import { ptTime } from "@/lib/time";
import PropsBoard from "@/components/PropsBoard";


export const revalidate = 60;

export const metadata: Metadata = {
  title: "Props",
  description: "Player prop lines posted for today's games. Nothing is filled in.",
};

export default async function PropsPage() {
  const { groups, fetchedAt } = await getPropsBoard();
  return (
    <>
      <h1 className="text-2xl font-black tracking-tight text-[color:var(--flat)] sm:text-3xl">Props</h1>
      <p className="mt-1 mb-5 text-sm text-zinc-400">
        Player lines from ESPN for today. Updated {ptTime(fetchedAt)}. Open a game for the longer list.
      </p>
      {groups.length === 0 ? (
        <p className="panel rounded-xl px-4 py-5 text-sm text-zinc-400">No player props posted for today’s games.</p>
      ) : (
        <PropsBoard groups={groups} />
      )}
    </>
  );
}
