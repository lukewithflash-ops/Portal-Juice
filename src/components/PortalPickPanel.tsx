import Link from "next/link";
import { PORTAL_PICK_LABEL, PORTAL_PICK_RULE, type PortalPick, type PortalRecord } from "@/lib/portalPick";

function n1(n: number) {
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 10) / 10);
}
function signed(n: number) {
  return n > 0 ? `+${n1(n)}` : n1(n);
}

export function PortalPickPanel({
  pick,
  record,
  tracked,
  compact = false,
}: {
  pick: PortalPick | null;
  record: PortalRecord;
  tracked: boolean;
  compact?: boolean;
}) {
  const shown = pick ? (pick.kind === "total" ? `${pick.side} ${n1(pick.line)}` : `${pick.side} ${signed(pick.line)}`) : null;
  const move = pick ? (pick.kind === "total" ? `${n1(pick.open)} → ${n1(pick.line)}` : `${signed(pick.open)} → ${signed(pick.line)}`) : null;
  const rateText = !tracked
    ? "Hit rate starts when the store is connected."
    : record.rate === null
      ? "No graded Portal Picks yet. The hit rate starts with the first final."
      : `Sample: ${record.hits}–${record.misses}${record.pushes ? `–${record.pushes}` : ""} (${record.graded} graded). A small sample, not proof.`;
  return (
    <section aria-label="Portal Pick" className="gold-edge rounded-2xl">
      <div className="foil-tile p-4">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[10px] font-black uppercase tracking-[0.24em] tone-gold">Portal Pick · free · one a day</span>
          {pick?.result ? (
            <span
              className={
                "rounded-full px-2 py-0.5 text-[10px] font-black uppercase " +
                (pick.result === "hit" ? "bg-[color:var(--gold)] text-black" : pick.result === "miss" ? "bg-[color:var(--minus)] text-white" : "bg-white/15 text-white")
              }
            >
              {pick.result}
            </span>
          ) : null}
        </div>
        {pick ? (
          <Link href={`/games/${pick.league}/${pick.gameId}`} className="mt-2 block">
            <div className="text-[13px] text-zinc-400">{pick.label}</div>
            <div className="big-num text-4xl font-black text-[color:var(--flat)]">{shown}</div>
            <div className="mt-1 flex flex-wrap items-baseline gap-x-3 text-[12px]">
              <span className="font-bold text-[color:var(--flat)]">Line move: {pick.kind} {move} since open</span>
              <span className="text-zinc-500">{pick.provider}</span>
            </div>
            {!compact ? <p className="mt-2 text-[13px] leading-snug text-zinc-300">{pick.homework}</p> : null}
            {pick.final ? <p className="mt-1 text-[12px] text-zinc-400">Final {pick.final}</p> : null}
          </Link>
        ) : (
          <p className="mt-2 text-sm text-zinc-400">No line has moved on a game that has not started yet. No Portal Pick until one does.</p>
        )}
        <div className="mt-3 rounded-xl bg-white/5 px-3 py-2 text-[12px] font-bold text-[color:var(--flat)]">{rateText}</div>
        <p className="mt-2 text-[11px] text-zinc-500">{PORTAL_PICK_LABEL}</p>
        {!compact ? <p className="mt-1 text-[11px] leading-snug text-zinc-500">Rule: {PORTAL_PICK_RULE}</p> : null}
      </div>
    </section>
  );
}
