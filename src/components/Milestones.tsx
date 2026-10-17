import Link from "next/link";
import Mark from "@/components/Mark";
import { checkHref, statFromMarket } from "@/lib/breakdown";
import type { HydratedMilestone } from "@/lib/espn";

/**
 * Milestone ladder rungs ("18+ Points"), folded away and labeled Milestone. Each opens Analyze as an
 * at-least leg (over threshold − 0.5). Never shown as the main line.
 */
export default function Milestones({ league, gameId, rows }: { league: string; gameId: string; rows: HydratedMilestone[] }) {
  if (!rows.length) return null;
  return (
    <details className="mt-2 rounded-xl border border-white/10 bg-white/[0.02]" data-testid="milestones">
      <summary className="cursor-pointer px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-zinc-400">Milestone ladders ({rows.length})</summary>
      <ul className="space-y-1 border-t border-white/5 px-3 py-2">
        {rows.map((m) => {
          const stat = statFromMarket(league, m.market);
          return (
            <li key={`${m.athleteId}-${m.market}-${m.threshold}`} className="flex items-center gap-2 text-[13px]" data-testid="milestone-row">
              <Mark team={m.team} headshotUrl={m.headshot} label={m.name} size={24} league={league} />
              <span className="min-w-0 flex-1 truncate text-zinc-200">
                {m.name} <span className="text-zinc-500">· {m.team}</span>
              </span>
              <span className="shrink-0 text-[11px] text-zinc-400">
                Milestone · <b className="text-[color:var(--flat)]">{m.label}</b> {m.market}
              </span>
              {stat ? (
                <Link
                  href={checkHref([{ league, gameId, kind: "prop", athleteId: m.athleteId, athleteName: m.name, stat, line: m.threshold - 0.5, pick: "over" }])}
                  className="shrink-0 rounded-lg border border-purple-400/50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-purple-100"
                  aria-label={`Analyze milestone ${m.name} ${m.label} ${m.market}`}
                >
                  Analyze
                </Link>
              ) : null}
            </li>
          );
        })}
      </ul>
    </details>
  );
}
