import Link from "next/link";
import Mark from "@/components/Mark";
import type { Favorite, HotTrend, LineMove } from "@/lib/best";
import type { MvpRow } from "@/lib/espn";

export const BEST_NOTE = "Ranked by the numbers. Not a guarantee.";

function Gold({ first, children }: { first: boolean; children: React.ReactNode }) {
  return <div className={first ? "gold-edge rounded-2xl" : ""}>{children}</div>;
}

export function FavoriteList({ rows }: { rows: Favorite[] }) {
  if (!rows.length) return <p className="text-sm text-zinc-400">No moneylines posted.</p>;
  return (
    <ol className="space-y-2">
      {rows.map((r, i) => (
        <li key={r.id}>
          <Gold first={i === 0}>
            <Link href={r.href} className="foil-tile flex items-center justify-between gap-3 px-3 py-2.5">
              <span className="min-w-0">
                <span className={`mr-2 tabular text-xs ${i === 0 ? "tone-gold" : "text-zinc-500"}`}>{i + 1}</span>
                <span className="font-bold text-[color:var(--flat)]">{r.side}</span>
                <span className="text-zinc-500"> · {r.label}</span>
              </span>
              <span className="text-right">
                <span className="tabular font-black text-[color:var(--flat)]">{r.odds}</span>
                <span className="mt-0.5 block text-[10px] text-zinc-500">{(r.implied * 100).toFixed(1)}% implied</span>
              </span>
            </Link>
          </Gold>
        </li>
      ))}
    </ol>
  );
}

export function MoveList({ rows }: { rows: LineMove[] }) {
  if (!rows.length) return <p className="text-sm text-zinc-400">No open-to-current move posted yet.</p>;
  return (
    <ol className="space-y-2">
      {rows.map((r, i) => {
        const up = r.delta > 0;
        return (
          <li key={r.id}>
            <Gold first={i === 0}>
              <Link href={r.href} className="foil-tile flex items-center justify-between gap-3 px-3 py-2.5">
                <span className="min-w-0">
                  <span className={`mr-2 tabular text-xs ${i === 0 ? "tone-gold" : "text-zinc-500"}`}>{i + 1}</span>
                  <span className="font-bold text-[color:var(--flat)]">{r.label}</span>
                  <span className="block text-[11px] text-zinc-500">{r.provider}</span>
                </span>
                <span className={`tabular text-sm font-bold ${up ? "text-[color:var(--plus)]" : "text-[color:var(--minus)]"}`}>
                  {r.text}
                </span>
              </Link>
            </Gold>
          </li>
        );
      })}
    </ol>
  );
}

export function TrendList({ rows }: { rows: HotTrend[] }) {
  if (!rows.length) return <p className="text-sm text-zinc-400">No last-5 versus season split posted.</p>;
  return (
    <ol className="space-y-2">
      {rows.map((r, i) => (
        <li key={r.id}>
          <Gold first={i === 0}>
            <Link href={`/games/${r.league}/${r.gameId}`} className="foil-tile flex items-center gap-3 px-3 py-2.5">
              <span className={`tabular text-xs ${i === 0 ? "tone-gold" : "text-zinc-500"}`}>{i + 1}</span>
              <Mark team={r.team} headshotUrl={r.headshot} label={r.name} size={36} />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-bold text-[color:var(--flat)]">{r.name}</span>
                <span className="block truncate text-[11px] text-zinc-500">
                  Last {r.games}: {r.avg} {r.statLabel} · season {r.seasonAvg}
                </span>
              </span>
              <span className={`tabular font-black ${r.delta >= 0 ? "text-[color:var(--plus)]" : "text-[color:var(--minus)]"}`}>
                {r.delta > 0 ? "+" : ""}
                {r.delta}
              </span>
            </Link>
          </Gold>
        </li>
      ))}
    </ol>
  );
}

export function MvpList({ rows, provider }: { rows: MvpRow[]; provider: string }) {
  if (!rows.length) return <p className="text-sm text-zinc-400">No MVP prices posted.</p>;
  return (
    <ol className="space-y-2">
      {rows.slice(0, 5).map((r, i) => (
        <li key={r.id}>
          <Gold first={i === 0}>
            <div className="foil-tile flex items-center gap-3 px-3 py-2.5">
              <span className={`tabular text-xs ${i === 0 ? "tone-gold" : "text-zinc-500"}`}>{i + 1}</span>
              <Mark team={r.team} headshotUrl={r.headshot} label={r.name} size={36} />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-bold text-[color:var(--flat)]">{r.name}</span>
                <span className="block text-[11px] text-zinc-500">
                  {r.team} · {provider}
                </span>
              </span>
              <span className="text-right">
                <span className="tabular font-black text-[color:var(--flat)]">{r.odds}</span>
                <span className="mt-0.5 block text-[10px] text-zinc-500">{(r.implied * 100).toFixed(1)}%</span>
              </span>
            </div>
          </Gold>
        </li>
      ))}
    </ol>
  );
}
