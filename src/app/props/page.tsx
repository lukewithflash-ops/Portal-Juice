import type { Metadata } from "next";
import Link from "next/link";
import Mark from "@/components/Mark";
import { OddsText } from "@/components/Prefs";
import { getPropsBoard } from "@/lib/espn";
import { ptTime } from "@/lib/time";
import { checkHref, statFromMarket } from "@/lib/breakdown";

const num = (s: string | null) => {
  const m = /-?\d+(?:\.\d+)?/.exec(s ?? "");
  return m ? Number(m[0]) : null;
};

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
        <div className="space-y-6">
          {groups.map((g) => (
            <section key={g.game.id}>
              <div className="mb-2 flex items-baseline justify-between gap-3">
                <h2 className="text-sm font-black text-[color:var(--flat)]">
                  <Link href={`/games/${g.game.league}/${g.game.id}`} className="hover:text-white">
                    {g.game.away.abbr} @ {g.game.home.abbr}
                  </Link>
                  <span className="ml-2 text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                    {g.game.leagueLabel}
                    {g.provider ? ` · ${g.provider}` : ""}
                  </span>
                </h2>
                {g.total > g.props.length ? (
                  <Link
                    href={`/games/${g.game.league}/${g.game.id}`}
                    className="shrink-0 text-[11px] font-semibold text-purple-200/80"
                  >
                    {g.total} lines
                  </Link>
                ) : null}
              </div>
              <ul className="space-y-1.5">
                {g.props.map((p) => (
                  <li key={`${g.game.id}-${p.athleteId}-${p.market}`} className="foil-tile flex items-center gap-2 px-3 py-2">
                    <Mark team={p.team} headshotUrl={p.headshot} label={p.name} size={32} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-bold text-[color:var(--flat)]">{p.name}</div>
                      <div className="truncate text-[11px] text-zinc-500">{p.market}</div>
                    </div>
                    <div className="tabular text-right font-black text-[color:var(--flat)]">
                      <OddsText value={p.line} />
                      {p.openLine ? <div className="text-[10px] font-medium text-zinc-500">Opened {p.openLine}</div> : null}
                    </div>
                    {statFromMarket(g.game.league, p.market) ? (
                      <Link
                        href={checkHref([
                          {
                            league: g.game.league,
                            gameId: g.game.id,
                            kind: "prop",
                            athleteId: p.athleteId,
                            athleteName: p.name,
                            stat: statFromMarket(g.game.league, p.market) ?? undefined,
                            line: num(p.line),
                            openLine: num(p.openLine),
                            pick: "over",
                          },
                        ])}
                        className="shrink-0 rounded-lg border border-purple-400/50 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-purple-100 hover:bg-purple-500/20"
                        aria-label={`Analyze ${p.name} ${p.market}`}
                      >
                        Analyze
                      </Link>
                    ) : null}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </>
  );
}
