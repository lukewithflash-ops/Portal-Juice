import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import GameDetailView from "@/components/GameDetailView";
import GameLive from "@/components/GameLive";
import FollowStar from "@/components/FollowStar";
import TopPicks from "@/components/TopPicks";
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
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="big-num text-[2.6rem] font-black leading-none tracking-tight text-[color:var(--flat)]">
            {game.away.abbr} <span className="text-zinc-500">@</span> {game.home.abbr}
          </h1>
          <p className="mt-1 text-[15px] font-bold text-zinc-200">
            {game.away.name} at {game.home.name}
          </p>
        </div>
        <FollowStar league={league} id={id} label={`${game.away.abbr} @ ${game.home.abbr}`} big />
      </div>
      <p className="mt-1 mb-4 text-sm text-zinc-400">
        {game.leagueLabel}
        {game.state === "in" ? " · Live" : game.state === "post" ? " · Final" : ""}
      </p>
      {game.state !== "post" ? (
        <TopPicks league={league} id={id} home={game.home.abbr} away={game.away.abbr} live={game.state === "in"} />
      ) : null}
      <GameLive
        league={league}
        id={id}
        away={game.away.abbr}
        home={game.home.abbr}
        props={bundle.props.map((p) => ({
          athleteId: p.athleteId,
          name: p.name,
          team: p.team,
          headshot: p.headshot,
          market: p.market,
          line: p.line,
        }))}
      />
      <div className="mt-6 max-w-xl">
        <GameDetailView bundle={bundle} />
      </div>
    </>
  );
}
