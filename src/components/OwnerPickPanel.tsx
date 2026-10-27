import Link from "next/link";
import { gameRoute } from "@/lib/gameRoute";
import { DAILY_PICK_NAME, ownerPickText } from "@/lib/ownerPick";
import type { OwnerSlotView } from "@/lib/ownerPickStore";

export function OwnerPickPanel({ slot, view, locked = false }: { slot: "vip" | "free"; view: OwnerSlotView; locked?: boolean }) {
  const { pick, record } = view;
  const rec = record.w + record.l + record.p
    ? `${record.w}-${record.l}-${record.p}${record.rate !== null ? ` · ${record.rate}%` : ""}${record.streak ? ` · ${record.streak}` : ""}`
    : "No graded picks yet";
  return (
    <section aria-label={`${DAILY_PICK_NAME} ${slot}`} data-testid={`ownerpick-${slot}`} className="gold-edge rounded-2xl">
      <div className="foil-tile p-4">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[10px] font-black uppercase tracking-[0.24em] tone-gold">{DAILY_PICK_NAME} · {slot === "vip" ? "VIP" : "Free"}</span>
          <span className="rounded-full border border-[color:var(--gold)]/60 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-[color:var(--gold)]">✓ Signed · Owner</span>
        </div>
        {locked ? (
          <p className="mt-2 text-sm text-zinc-300">{pick ? "Today's VIP pick is posted." : `${DAILY_PICK_NAME} drops soon.`} <Link href="/vip" className="font-bold text-[color:var(--gold)]">VIP only</Link></p>
        ) : pick ? (
          <Link href={gameRoute(pick.league, pick.gameId)} className="mt-2 block">
            <div className="text-[13px] text-zinc-400">{pick.label}</div>
            <div className="flex items-baseline gap-3">
              <span className="big-num text-4xl font-black text-[color:var(--flat)]">{ownerPickText(pick)}</span>
              {pick.odds ? <span className="tabular text-lg font-bold text-zinc-300">{pick.odds}</span> : null}
              {pick.result ? <span className={"rounded-full px-2 py-0.5 text-[10px] font-black uppercase " + (pick.result === "hit" ? "bg-[color:var(--gold)] text-black" : pick.result === "miss" ? "bg-[color:var(--minus)] text-white" : "bg-white/15 text-white")}>{pick.result === "hit" ? "W" : pick.result === "miss" ? "L" : "P"}</span> : null}
            </div>
            <div className="text-[11px] text-zinc-500">DraftKings · at post</div>
            {pick.note ? <p className="mt-2 text-[13px] leading-snug text-zinc-300">“{pick.note}”</p> : null}
            {pick.final ? <p className="mt-1 text-[12px] text-zinc-400">Final {pick.final}</p> : null}
          </Link>
        ) : (
          <p className="mt-2 text-sm text-zinc-400">{DAILY_PICK_NAME} drops soon.</p>
        )}
        <div className="mt-3 rounded-xl bg-white/5 px-3 py-2 text-[12px] font-bold text-[color:var(--flat)]">Record {rec}. Not a guarantee.</div>
      </div>
    </section>
  );
}
