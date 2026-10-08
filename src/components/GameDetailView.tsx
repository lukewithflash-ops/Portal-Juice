import Link from "next/link";
import { OddsText } from "@/components/Prefs";
import Mark from "@/components/Mark";
import type { DetailBundle, HydratedProp } from "@/lib/espn";
import { ptDayTime } from "@/lib/time";

function Fold({
  title,
  open = false,
  children,
}: {
  title: string;
  open?: boolean;
  children: React.ReactNode;
}) {
  return (
    <details className="fold foil-tile mt-3" open={open}>
      <summary className="cursor-pointer px-4 py-3 text-xs font-bold uppercase tracking-[0.18em] text-purple-200/80">
        {title}
      </summary>
      <div className="border-t border-purple-500/15 px-4 py-3">{children}</div>
    </details>
  );
}

function PropGroups({ props, provider, total }: { props: HydratedProp[]; provider: string | null; total: number }) {
  if (!props.length) {
    return <p className="text-sm text-zinc-400">No player props posted for this game.</p>;
  }
  const groups = new Map<string, HydratedProp[]>();
  for (const p of props) {
    const list = groups.get(p.market) ?? [];
    list.push(p);
    groups.set(p.market, list);
  }
  return (
    <div className="space-y-3">
      <p className="text-[11px] text-zinc-500">
        {provider ? `${provider}. ` : ""}
        Showing {props.length}
        {total > props.length ? ` of ${total}` : ""} lines ESPN returned. No price is filled in.
      </p>
      {[...groups.entries()].map(([market, rows]) => (
        <div key={market}>
          <h3 className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">{market}</h3>
          <ul className="mt-1 space-y-1.5">
            {rows.map((p) => (
              <li key={`${p.athleteId}-${p.market}`} className="flex items-center gap-2 text-sm">
                <Mark team={p.team} headshotUrl={p.headshot} label={p.name} size={32} />
                <span className="min-w-0 flex-1 truncate text-[color:var(--flat)]">
                  {p.name}
                  {p.team ? <span className="text-zinc-500"> · {p.team}</span> : null}
                </span>
                <span className="tabular text-right font-black text-[color:var(--flat)]">
                  {p.line}
                  {p.openLine ? (
                    <span className="mt-0.5 block text-[10px] font-medium text-zinc-500">Opened {p.openLine}</span>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

export default function GameDetailView({ bundle }: { bundle: DetailBundle }) {
  const { game, detail, props, propTotal, propProvider } = bundle;
  const move = detail.move;
  const homeAbbr = game.home.abbr;
  const awayAbbr = game.away.abbr;
  return (
    <div>
      <Fold title="Price" open>
        {move ? (
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">{move.provider}</p>
            {move.total !== null ? (
              <div className="mt-2 flex items-end justify-between gap-3">
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-zinc-500">Total</div>
                  <div className="big-num text-5xl font-black text-[color:var(--flat)]">{move.total}</div>
                  {move.totalOpen !== null && move.totalOpen !== move.total ? (
                    <div className="text-[11px] text-zinc-400">
                      Opened <span className="tabular">{move.totalOpen}</span>
                    </div>
                  ) : null}
                </div>
                <div className="text-right text-xs text-zinc-300">
                  {move.overJuice ? (
                    <div>
                      Over <span className="tabular font-bold"><OddsText value={move.overJuice} /></span>
                    </div>
                  ) : null}
                  {move.underJuice ? (
                    <div>
                      Under <span className="tabular font-bold"><OddsText value={move.underJuice} /></span>
                    </div>
                  ) : null}
                </div>
              </div>
            ) : (
              <p className="mt-2 text-sm text-zinc-400">No total posted.</p>
            )}
            <div className="mt-3 space-y-1 text-sm text-zinc-300">
              {(move.spreadDetail || move.homeSpread) && (
                <p>
                  Spread{" "}
                  <span className="tabular text-[color:var(--flat)]">
                    {move.spreadDetail || `${homeAbbr} ${move.homeSpread ?? ""}`}
                  </span>
                  {move.spreadHomeOpen !== null && move.spreadHomeOpen !== move.spreadHome ? (
                    <span className="text-zinc-500"> · opened {move.spreadHomeOpen}</span>
                  ) : null}
                </p>
              )}
              {(move.homeMl || move.awayMl) && (
                <p>
                  Moneyline{" "}
                  <span className="tabular text-[color:var(--flat)]">
                    {awayAbbr} <OddsText value={move.awayMl} /> · {homeAbbr} <OddsText value={move.homeMl} />
                  </span>
                  {move.homeMlOpen || move.awayMlOpen ? (
                    <span className="text-zinc-500">
                      {" "}
                      · opened {awayAbbr} <OddsText value={move.awayMlOpen} /> / {homeAbbr} <OddsText value={move.homeMlOpen} />
                    </span>
                  ) : null}
                </p>
              )}
            </div>
          </div>
        ) : (
          <p className="text-sm text-zinc-400">No total, spread, or moneyline from ESPN for this game.</p>
        )}
        {detail.projection ? (
          <p className="mt-3 text-[11px] text-zinc-500">
            ESPN matchup projection: {awayAbbr} {detail.projection.away}% · {homeAbbr} {detail.projection.home}%.
            Their number, not ours.
          </p>
        ) : null}
      </Fold>

      <Fold title={`Player props${props.length ? ` · ${props.length}` : ""}`} open>
        <PropGroups props={props} provider={propProvider} total={propTotal} />
      </Fold>

      <Fold title="Place and broadcast" open>
        <ul className="space-y-1 text-sm text-zinc-300">
          <li>{detail.venue || "No venue posted."}</li>
          <li>{detail.weather || "No weather posted."}</li>
          <li>{game.broadcasts.length ? game.broadcasts.join(" · ") : "No broadcast posted."}</li>
          {detail.officials ? <li>Officials {detail.officials}</li> : null}
        </ul>
      </Fold>

      {detail.periods.length > 0 && (
        <Fold title="By period">
          <ul className="space-y-1 text-sm tabular text-zinc-200">
            {detail.periods.map((p) => (
              <li key={p.label} className="flex justify-between">
                <span className="text-zinc-500">{p.label}</span>
                <span>
                  {awayAbbr} {p.away} · {homeAbbr} {p.home}
                </span>
              </li>
            ))}
          </ul>
        </Fold>
      )}

      <Fold title="Leaders">
        {detail.leaders.length === 0 ? (
          <p className="text-sm text-zinc-400">No leaders posted.</p>
        ) : (
          <ul className="space-y-2">
            {detail.leaders.map((l) => (
              <li key={`${l.team}-${l.category}-${l.name}`} className="flex items-center gap-2">
                <Mark team={l.team} headshotUrl={l.headshot} label={l.name} size={36} />
                <div className="min-w-0">
                  <div className="truncate text-sm font-bold text-[color:var(--flat)]">{l.name}</div>
                  <div className="text-[11px] text-zinc-400">
                    {l.team} · {l.category} · <span className="tabular">{l.line}</span>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Fold>

      <Fold title="Team stats">
        {detail.teamStats.length === 0 ? (
          <p className="text-sm text-zinc-400">No team stats posted.</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="text-[10px] uppercase tracking-wider text-zinc-500">
                <th className="py-1 font-bold">{awayAbbr}</th>
                <th className="py-1 text-center font-bold"> </th>
                <th className="py-1 text-right font-bold">{homeAbbr}</th>
              </tr>
            </thead>
            <tbody>
              {detail.teamStats.map((s) => (
                <tr key={s.label} className="border-t border-purple-500/10">
                  <td className="tabular py-1.5 text-zinc-200">{s.away}</td>
                  <td className="px-2 py-1.5 text-center text-[11px] text-zinc-500">{s.label}</td>
                  <td className="tabular py-1.5 text-right text-zinc-200">{s.home}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Fold>

      <Fold title="Recent form">
        {detail.form.length === 0 ? (
          <p className="text-sm text-zinc-400">No recent games posted.</p>
        ) : (
          <ul className="space-y-1.5 text-sm">
            {detail.form.map((f) => (
              <li key={`${f.team}-${f.id}`}>
                <Link href={`/games/${game.league}/${f.id}`} className="flex justify-between gap-3 hover:text-white">
                  <span className="text-zinc-300">
                    {f.team} {f.label}
                  </span>
                  <span className="tabular text-[color:var(--flat)]">
                    {f.result} {f.score}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Fold>

      <Fold title="Head to head">
        {detail.series ? <p className="text-sm text-zinc-200">{detail.series}</p> : null}
        {detail.ats.length > 0 ? (
          <ul className="mt-2 space-y-1 text-sm text-zinc-300">
            {detail.ats.map((a) => (
              <li key={a.team}>
                {a.team} against the spread <span className="tabular text-[color:var(--flat)]">{a.summary}</span>
              </li>
            ))}
          </ul>
        ) : null}
        {!detail.series && detail.ats.length === 0 ? (
          <p className="text-sm text-zinc-400">No series or spread record posted.</p>
        ) : null}
      </Fold>

      <Fold title={`Injuries${detail.injuries.length ? ` · ${detail.injuries.length}` : ""}`}>
        {detail.injuries.length === 0 ? (
          <p className="text-sm text-zinc-400">No injury list posted.</p>
        ) : (
          <ul className="space-y-2">
            {detail.injuries.map((inj) => (
              <li key={`${inj.team}-${inj.name}`} className="flex items-center gap-2 text-sm">
                <Mark team={inj.team} headshotUrl={inj.headshot} label={inj.name} size={32} />
                <span className="min-w-0 flex-1 truncate text-[color:var(--flat)]">{inj.name}</span>
                <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">{inj.status}</span>
              </li>
            ))}
          </ul>
        )}
      </Fold>

      <Fold title="News">
        {detail.stories.length === 0 ? (
          <p className="text-sm text-zinc-400">No stories from ESPN for this game.</p>
        ) : (
          <ul className="space-y-2">
            {detail.stories.map((s) => (
              <li key={s.id}>
                <a href={s.url} className="text-sm font-bold text-[color:var(--flat)] hover:text-white" rel="noreferrer">
                  {s.headline}
                </a>
                {s.published ? <div className="text-[10px] text-zinc-500">{ptDayTime(s.published)} · ESPN</div> : null}
              </li>
            ))}
          </ul>
        )}
      </Fold>
    </div>
  );
}

export { PropGroups };
