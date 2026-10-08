import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import GameTile from "@/components/GameTile";
import { getGame } from "@/lib/espn";
import { leagueById } from "@/lib/slate";

export const revalidate = 60;

type Params = { league: string; id: string };

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { league, id } = await params;
  const game = await getGame(league, id);
  if (!game) return { title: "Game" };
  const title = `${game.away.abbr} at ${game.home.abbr}`;
  const total = game.price?.total;
  const description =
    total != null
      ? `${title}. Total ${total} via ${game.price?.provider}. Lines and prices only.`
      : `${title}. No total posted. Lines and prices only.`;
  return { title, description };
}

export default async function GamePage({ params }: { params: Promise<Params> }) {
  const { league, id } = await params;
  if (!leagueById(league)) notFound();
  const game = await getGame(league, id);
  if (!game) notFound();
  return (
    <>
      <p className="mb-3 text-[11px]">
        <Link href="/games" className="font-bold uppercase tracking-[0.16em] text-purple-200/80 hover:text-white">
          Games
        </Link>
      </p>
      <h1 className="mb-4 text-2xl font-black tracking-tight text-[color:var(--flat)]">
        {game.away.name} at {game.home.name}
      </h1>
      <div className="max-w-xl">
        <GameTile game={game} />
      </div>
    </>
  );
}
