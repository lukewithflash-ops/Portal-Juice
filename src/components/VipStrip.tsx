import Link from "next/link";
import { sportsDate } from "@/lib/slate";
import { vipDay, vipRecordAll } from "@/lib/vipStore";

/** Home entry to VIP: how many picks are live today and the public record. No pick details. */
export default async function VipStrip() {
  const [today, rec] = await Promise.all([vipDay(sportsDate()).catch(() => []), vipRecordAll().catch(() => null)]);
  const open = today.filter((p) => !p.result).length;
  const r = rec?.record;
  return (
    <Link href="/vip" className="press flex items-center gap-3 rounded-2xl border border-[color:var(--gold)]/40 bg-[color:var(--gold)]/[0.06] px-4 py-3" data-testid="vip-strip">
      <span aria-hidden className="text-xl">
        💎
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-black text-white">
          VIP {open ? <span className="text-[color:var(--gold)]">· {open} pick{open === 1 ? "" : "s"} today</span> : <span className="text-zinc-400">· picks post when the data lines up</span>}
        </span>
        <span className="block truncate text-[12px] text-zinc-400">
          {r && r.wins + r.losses + r.pushes ? `Record ${r.wins}–${r.losses}${r.pushes ? `–${r.pushes}` : ""}${r.streak ? ` · ${r.streak.kind}${r.streak.n} streak` : ""}` : "Public record from the first final"} · Not a guarantee.
        </span>
      </span>
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 text-zinc-500" aria-hidden>
        <path d="m9 6 6 6-6 6" />
      </svg>
    </Link>
  );
}
