import type { Metadata } from "next";
import PageHeader from "@/components/PageHeader";
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
      <PageHeader title="Props" sub={<>Today’s player lines · {ptTime(fetchedAt)}</>} note="Open a game for the full list." />
      {groups.length === 0 ? (
        <p className="panel rounded-xl px-4 py-5 text-sm text-zinc-400">No player props posted for today’s games.</p>
      ) : (
        <PropsBoard groups={groups} />
      )}
    </>
  );
}
