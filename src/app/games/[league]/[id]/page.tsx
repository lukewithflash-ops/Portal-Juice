import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import GameChat from "@/components/GameChat";
import GameDetailView from "@/components/GameDetailView";
import LiveDesk from "@/components/LiveDesk";
import GameTile from "@/components/GameTile";
import { getGameDetail } from "@/lib/espn";
import { leagueById } from "@/lib/slate";

export const revalidate = 60;

type Params = { league: string; id: string };

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { league, id } = await params;
  const bundle = await getGameDetail(league, id);
  if (!bundle) return { title: "Game" };
  const { game } = bundle;
  const title = `${game.away.abbr} at ${game.home.abbr}`;
  const total = bundle.detail.move?.total ?? game.price?.total;
  const provider = bundle.detail.move?.provider ?? game.price?.provider;
  const description =
    total != null
      ? `${title}. Total ${total}${provider ? ` via ${provider}` : ""}. Lines and prices only.`
      : `${title}. No total posted. Lines and prices only.`;
  return { title, description };
}

export default async function GamePage({ params }: { params: Promise<Params> }) {
  const { league, id } = await params;
  if (!leagueById(league)) notFound();
  const bundle = await getGameDetail(league, id);
  if (!bundle) notFound();
  const { game } = bundle;
  return (
    <>
      <p className="mb-3 text-[11px]">
        <Link href="/games" className="font-bold uppercase tracking-[0.16em] text-purple-200/80 hover:text-white">
          Games
        </Link>
      </p>
      <h1 className="text-2xl font-black tracking-tight text-[color:var(--flat)]">
        {game.away.name} at {game.home.name}
      </h1>
      <p className="mt-1 mb-4 text-sm text-zinc-400">
        {game.leagueLabel}
        {game.state === "in" ? " · Live" : game.state === "post" ? " · Final" : ""}
      </p>
      <div className="max-w-xl">
        <GameTile game={game} />
        <LiveDesk league={league} id={id} />
        <GameDetailView bundle={bundle} />
        <GameChat league={league} id={id} />
      </div>
    </>
  );
}
