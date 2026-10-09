"use client";

import Link from "next/link";
import { OddsText } from "@/components/Prefs";
import FollowStar from "@/components/FollowStar";
import TopPicks from "@/components/TopPicks";
import { useEffect, useState } from "react";
import { TAGLINE } from "@/lib/site";
import type { Game, Price } from "@/lib/slate";

export type MoveFlag = {
  total?: { from: number; to: number };
  spread?: { from: number; to: number };
};

function LocalTime({ iso }: { iso: string }) {
  const [label, setLabel] = useState<string | null>(null);
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      setLabel(new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }));
    });
    return () => cancelAnimationFrame(id);
  }, [iso]);
  return <span className="tabular">{label ?? "…"}</span>;
}

function Countdown({ start, state }: { start: string; state: Game["state"] }) {
  const [label, setLabel] = useState<string | null>(null);
  useEffect(() => {
    if (state !== "pre") return;
    const tick = () => {
      const ms = Date.parse(start) - Date.now();
      if (!Number.isFinite(ms)) return;
      if (ms <= 0) {
        setLabel("Starting");
        return;
      }
      const s = Math.floor(ms / 1000);
      const h = Math.floor(s / 3600);
      const m = Math.floor((s % 3600) / 60);
      const sec = s % 60;
      setLabel(h > 0 ? `${h}h ${m}m` : `${m}m ${String(sec).padStart(2, "0")}s`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [start, state]);
  if (state !== "pre" || !label) return null;
  return <span className="tabular text-[color:var(--flat)]">{label}</span>;
}

function TeamLink({ league, abbr, rank }: { league: string; abbr: string; rank: number | null }) {
  return (
    <Link href={`/teams/${league}/${abbr.toLowerCase()}`} className="relative z-10 hover:text-white">
      {rank ? <span className="mr-1 align-top text-[11px] text-zinc-500">{rank}</span> : null}
      {abbr}
    </Link>
  );
}

/** "Philadelphia Eagles" → "Eagles". Keeps two-word nicknames like "Red Sox" whole when ESPN sends them. */
function nick(name: string) {
  const parts = name.split(" ");
  if (parts.length <= 1) return name;
  const two = /^(Red|White|Blue|Golden|Trail|Maple)$/.test(parts[parts.length - 2]);
  return parts.slice(two ? -2 : -1).join(" ");
}

function PriceBlock({ price, home, away }: { price: Price; home: string; away: string }) {
  return (
    <div className="mt-3">
      {price.total !== null ? (
        <div className="flex items-end justify-between gap-3">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
              Total
            </div>
            <div className="big-num text-2xl font-black text-zinc-200">{price.total}</div>
          </div>
          <div className="text-right text-xs text-zinc-300">
            {price.overJuice && (
              <div>
                Over <span className="tabular font-bold"><OddsText value={price.overJuice} /></span>
              </div>
            )}
            {price.underJuice && (
              <div>
                Under <span className="tabular font-bold"><OddsText value={price.underJuice} /></span>
              </div>
            )}
          </div>
        </div>
      ) : (
        <p className="text-sm text-zinc-400">No total posted.</p>
      )}
      <div className="mt-2 space-y-0.5 text-[11px] text-zinc-400">
        {(price.spreadDetail || price.homeSpread) && (
          <div>
            Spread{" "}
            <span className="tabular text-zinc-200">
              {price.spreadDetail ||
                `${home} ${price.homeSpread ?? ""}${price.awaySpread ? ` / ${away} ${price.awaySpread}` : ""}`}
            </span>
            {price.homeSpreadJuice && (
              <span className="tabular">
                {" "}
                ({home} <OddsText value={price.homeSpreadJuice} />
                {price.awaySpreadJuice ? <> / {away} <OddsText value={price.awaySpreadJuice} /></> : ""})
              </span>
            )}
          </div>
        )}
        {(price.homeMl || price.awayMl) && (
          <div>
            Moneyline{" "}
            <span className="tabular text-zinc-200">
              {away} <OddsText value={price.awayMl} /> · {home} <OddsText value={price.homeMl} />
            </span>
          </div>
        )}
        <div className="uppercase tracking-wider text-zinc-500">{price.provider}</div>
      </div>
    </div>
  );
}

export default function GameTile({
  game,
  move,
  rich = true,
  yours = false,
}: {
  game: Game;
  move?: MoveFlag | null;
  rich?: boolean;
  yours?: boolean;
}) {
  const moved = !!(move && (move.total || move.spread));
  const down =
    (move?.total && move.total.to < move.total.from) ||
    (move?.spread && move.spread.to < move.spread.from);
  const showScore = game.state === "in" || game.state === "post";
  const [picksOpen, setPicksOpen] = useState(false);
  return (
    <article
      className={`foil-tile relative p-4 ${moved ? `line-moved ${down ? "against" : ""}` : ""}`}
    >
      <Link
        href={`/games/${game.league}/${game.id}`}
        aria-label={`${game.away.abbr} at ${game.home.abbr}`}
        className="absolute inset-0 z-0 rounded-2xl"
      />
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-purple-200/80">
            {game.leagueLabel}
            {game.national ? " · National TV" : ""}
            {game.ranked ? " · Ranked" : ""}
            {yours ? " · Your team" : ""}
          </div>
          <h3 className="big-num mt-1 truncate text-[1.85rem] font-black leading-none text-[color:var(--flat)]">
            <TeamLink league={game.league} abbr={game.away.abbr} rank={game.away.rank} />
            <span className="mx-1.5 text-zinc-500">@</span>
            <TeamLink league={game.league} abbr={game.home.abbr} rank={game.home.rank} />
          </h3>
          <p className="mt-1 truncate text-[12px] font-semibold text-zinc-400">
            {nick(game.away.name)} at {nick(game.home.name)}
          </p>
        </div>
        <div className="flex shrink-0 items-start gap-1.5">
        {game.state !== "post" ? <FollowStar league={game.league} id={game.id} label={`${game.away.abbr} @ ${game.home.abbr}`} /> : null}
        {game.state === "in" ? (
          <span className="pill pill-win shrink-0">Live{game.clock ? ` ${game.clock}` : ""}</span>
        ) : game.state === "post" ? (
          <span className="pill pill-push shrink-0">Final</span>
        ) : (
          <span className="shrink-0 text-right text-[11px] text-zinc-400">
            <LocalTime iso={game.start} />
            <span className="mt-0.5 block text-[color:var(--flat)]">
              <Countdown start={game.start} state={game.state} />
            </span>
          </span>
        )}
        </div>
      </div>

      {showScore && (
        <p className="big-num mt-2 text-2xl font-black text-zinc-200">
          {game.away.abbr} {game.away.score ?? "0"}
          <span className="mx-2 text-zinc-600">·</span>
          {game.home.abbr} {game.home.score ?? "0"}
        </p>
      )}

      {game.broadcasts.length > 0 && (
        <p className="mt-1 truncate text-[11px] text-zinc-500">{game.broadcasts.join(" · ")}</p>
      )}

      {rich &&
        (game.price ? (
          <PriceBlock price={game.price} home={game.home.abbr} away={game.away.abbr} />
        ) : (
          <p className="mt-3 text-sm text-zinc-400">No total, spread, or moneyline from ESPN for this game.</p>
        ))}

      {moved && (
        <p className={`mt-2 text-[11px] font-semibold ${down ? "text-[color:var(--minus)]" : "text-[color:var(--plus)]"}`}>
          {TAGLINE}{" "}
          {move?.total && (
            <span className="tabular font-medium text-zinc-300">
              Total {move.total.from} → {move.total.to}.{" "}
            </span>
          )}
          {move?.spread && (
            <span className="tabular font-medium text-zinc-300">
              Spread {move.spread.from} → {move.spread.to}.{" "}
            </span>
          )}
          <span className="font-medium text-zinc-500">Green is up, red is down.</span>
        </p>
      )}

      {picksOpen ? <TopPicks league={game.league} id={game.id} home={game.home.abbr} away={game.away.abbr} live={game.state === "in"} compact /> : null}

      <div className="mt-3 flex items-center justify-between text-[11px]">
        <span className="flex items-center gap-3">
          <Link href={`/games/${game.league}/${game.id}`} className="relative z-10 font-semibold text-purple-200/90 hover:text-white">
            Game
          </Link>
          {game.state !== "post" ? (
            <button
              type="button"
              onClick={() => setPicksOpen((v) => !v)}
              aria-expanded={picksOpen}
              className="relative z-10 font-bold tone-gold"
            >
              {picksOpen ? "Hide picks" : "3 picks ▾"}
            </button>
          ) : null}
        </span>
        {(game.home.record || game.away.record) && (
          <span className="tabular text-zinc-500">
            {game.away.abbr} {game.away.record ?? ""} · {game.home.abbr} {game.home.record ?? ""}
          </span>
        )}
      </div>
    </article>
  );
}
