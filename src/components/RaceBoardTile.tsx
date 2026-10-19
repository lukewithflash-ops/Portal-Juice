import Link from "next/link";
import type { GolfBoard } from "@/lib/sports";
import { ptDayTime } from "@/lib/time";

/** A race weekend on the Games board: next session times in PT, the top of the order when ESPN has one, and a link to the race page. */
export default function RaceBoardTile({ b }: { b: GolfBoard & { race: NonNullable<GolfBoard["race"]> } }) {
  const r = b.race;
  const next = r.sessions.find((s) => s.state === "in") ?? r.sessions.find((s) => s.state === "pre");
  return (
    <Link href={r.href} className="foil-tile block p-4" data-testid="race-board">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="min-w-0 truncate text-lg font-black text-[color:var(--flat)]">{b.name}</h3>
        <span className={b.state === "in" ? "pill pill-win shrink-0" : "shrink-0 text-[11px] text-zinc-400"}>{b.state === "in" ? "Live" : b.state === "post" ? "Final" : "Upcoming"}</span>
      </div>
      {r.circuit ? <p className="text-[11px] text-zinc-400">{r.circuit}</p> : null}
      {next ? (
        <p className="mt-1 text-[12px] font-bold text-purple-200">
          {next.state === "in" ? `${next.label} live · ${b.detail}` : `${next.label} · ${ptDayTime(next.date)}`}
        </p>
      ) : null}
      {b.rows.length ? (
        <ol className="mt-2 space-y-0.5 text-[13px]">
          {b.rows.slice(0, 5).map((x) => (
            <li key={x.name} className="flex gap-2">
              <span className="w-7 tabular text-zinc-500">P{x.pos}</span>
              <span className="truncate font-semibold text-zinc-100">{x.name}</span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="mt-2 text-[12px] text-zinc-500">The field and running order post when ESPN does.</p>
      )}
      <p className="mt-2 text-[11px] font-black text-[color:var(--plus)]">Open race →</p>
    </Link>
  );
}
