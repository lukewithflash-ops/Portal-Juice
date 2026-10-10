import MatchFx from "@/components/MatchFx";
import type { GolfBoard } from "@/lib/sports";

/** Golf leaderboard from ESPN, top 25. */
export default function GolfBoardView({ b }: { b: GolfBoard }) {
  return (
    <section className="foil-tile p-4">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-lg font-black text-[color:var(--flat)]">{b.name}</h3>
        <span className={b.state === "in" ? "pill pill-win" : "text-[11px] text-zinc-400"}>{b.state === "in" ? "Live" : b.detail}</span>
      </div>
      {b.state === "in" ? <p className="text-[11px] text-zinc-400">{b.detail}</p> : null}
      <table className="mt-2 w-full text-[13px]">
        <thead>
          <tr className="text-left text-[10px] uppercase tracking-wider text-zinc-500">
            <th className="w-10 py-1">Pos</th>
            <th>Player</th>
            <th className="text-right">To par</th>
            <th className="text-right">Rd</th>
            <th className="text-right">Thru</th>
          </tr>
        </thead>
        <tbody>
          {b.rows.slice(0, 25).map((r) => (
            <tr key={r.name} className="border-t border-white/5">
              <td className="py-1 tabular text-zinc-400">{r.pos}</td>
              <td className="truncate font-semibold text-zinc-100">
                {r.flag ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={r.flag} alt="" width={14} height={14} className="mr-1.5 inline h-3.5 w-3.5 align-[-2px]" />
                ) : null}
                {r.name}
              </td>
              <td className={"text-right font-black tabular " + (r.score.startsWith("-") ? "text-[color:var(--plus)]" : "text-zinc-200")}><MatchFx sig={r.score} kind="golf" small>{r.score}</MatchFx></td>
              <td className="text-right tabular text-zinc-400">{r.today ?? "—"}</td>
              <td className="text-right tabular text-zinc-400">{r.thru ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-[10px] text-zinc-500">ESPN leaderboard, top 25. No win chance: ESPN posts no odds for golf here.</p>
    </section>
  );
}

