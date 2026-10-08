import type { Metadata } from "next";
import Mark from "@/components/Mark";
import { OddsText } from "@/components/Prefs";
import MvpMovers from "@/components/MvpMovers";
import { IMPLIED_BASIS } from "@/lib/detail";
import { getMvpBoard, type MvpRow } from "@/lib/espn";
import { ptTime } from "@/lib/time";

export const revalidate = 60;

export const metadata: Metadata = {
  title: "MVP",
  description: "MVP futures ranked by the market implied chance. Not a pick.",
};

function pct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

function Row({ row, provider }: { row: MvpRow; provider: string }) {
  return (
    <article className="foil-tile flex items-center gap-3 px-3 py-2.5">
      <Mark team={row.team} headshotUrl={row.headshot} label={row.name} size={40} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-bold text-[color:var(--flat)]">
          {row.name}
          {row.team ? <span className="text-zinc-500"> · {row.team}</span> : null}
        </div>
        <div className="truncate text-[11px] text-zinc-500">
          {row.stats || "No season line posted"} · {provider}
        </div>
      </div>
      <div className="text-right">
        <div className="tabular text-lg font-black text-[color:var(--flat)]"><OddsText value={row.odds} /></div>
        <div className="tabular text-[10px] text-zinc-500">{pct(row.implied)}</div>
      </div>
    </article>
  );
}

export default async function MvpPage() {
  const { groups, fetchedAt } = await getMvpBoard();
  const flat = groups.flatMap((g) => g.rows.map((r) => ({ ...r, provider: g.provider, leagueLabel: g.leagueLabel })));
  return (
    <>
      <h1 className="text-2xl font-black tracking-tight text-[color:var(--flat)] sm:text-3xl">MVP</h1>
      <p className="mt-1 text-sm text-zinc-400">Futures from ESPN. Updated {ptTime(fetchedAt)}.</p>
      <p className="mt-1 mb-5 text-[11px] leading-relaxed text-zinc-500">{IMPLIED_BASIS}</p>

      {groups.length === 0 ? (
        <p className="panel rounded-xl px-4 py-5 text-sm text-zinc-400">No MVP futures posted.</p>
      ) : (
        <>
          <section>
            <h2 className="text-xs font-bold uppercase tracking-[0.22em] text-purple-200/80">Best of the board</h2>
            <p className="mt-1 mb-3 text-[11px] text-zinc-500">Ranked by the market implied chance. Not a pick.</p>
            {groups.map((g) => (
              <div key={g.league} className="mb-4">
                <h3 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-zinc-400">
                  {g.leagueLabel} · {g.market} · {g.provider}
                </h3>
                <ol className="space-y-2">
                  {g.rows.slice(0, 5).map((r, i) => (
                    <li key={r.id} className="flex items-center gap-2">
                      <span className="tabular w-4 text-xs text-zinc-500">{i + 1}</span>
                      <div className="min-w-0 flex-1">
                        <Row row={r} provider={g.provider} />
                      </div>
                    </li>
                  ))}
                </ol>
              </div>
            ))}
          </section>

          <MvpMovers rows={flat.map((r) => ({ id: r.id, name: r.name, team: r.team, odds: r.odds, oddsNum: r.oddsNum }))} />

          {groups.map((g) => (
            <section key={`all-${g.league}`} className="mt-8">
              <h2 className="text-xs font-bold uppercase tracking-[0.22em] text-purple-200/80">
                {g.leagueLabel} board · {g.rows.length}
              </h2>
              <div className="mt-3 space-y-2">
                {g.rows.map((r) => (
                  <Row key={r.id} row={r} provider={g.provider} />
                ))}
              </div>
            </section>
          ))}
        </>
      )}
    </>
  );
}
