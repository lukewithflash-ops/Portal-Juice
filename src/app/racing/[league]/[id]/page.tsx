import type { Metadata } from "next";
import { redirect } from "next/navigation";
import RaceLive from "@/components/RaceLive";
import GameChatDock from "@/components/GameChatDock";
import { isRacing } from "@/lib/racing";
import { getRacePage } from "@/lib/racingFetch";

export const revalidate = 5;

type Params = { league: string; id: string };

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { league, id } = await params;
  const page = isRacing(league) ? await getRacePage(league, id).catch(() => null) : null;
  return { title: page ? page.event.name : "Race" };
}

export default async function RacePageRoute({ params, searchParams }: { params: Promise<Params>; searchParams: Promise<{ s?: string }> }) {
  const { league, id } = await params;
  const { s } = await searchParams;
  if (!isRacing(league)) redirect("/games");
  const page = await getRacePage(league, id, s ?? null).catch(() => null);
  if (!page) redirect(`/racing/${league}`);
  return (
    <>
      <RaceLive key={`${page.event.id}-${page.session?.id ?? ""}`} initial={page} />
      <GameChatDock league={league} id={id} label={page.event.name} />
    </>
  );
}
