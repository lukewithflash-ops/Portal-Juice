"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { leagueName, ptTime, RecordStrip, ResultChip } from "@/components/VipClient";
import { VIP_NOTE, type VipPick, type VipRecord } from "@/lib/vipCore";

/** Public: every graded VIP pick, newest first. Open picks stay locked for non-VIP until the final. */
export default function VipRecordClient() {
  const [d, setD] = useState<{ record: VipRecord; history: VipPick[] } | null>(null);
  useEffect(() => {
    fetch("/api/vip", { cache: "no-store" })
      .then((r) => r.json())
      .then(setD)
      .catch(() => {});
  }, []);
  if (!d) return <div className="skel h-40 rounded-2xl" />;
  return (
    <div className="mx-auto max-w-xl space-y-5" data-testid="vip-record-page">
      <RecordStrip rec={d.record} link={false} />
      <section>
        <h2 className="mb-2 px-1 text-[12px] font-semibold uppercase tracking-[0.12em] text-zinc-500">Graded picks</h2>
        {d.history.length ? (
          <ul className="divide-y divide-white/5 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]">
            {d.history.map((p) => (
              <li key={p.id} className="flex items-center gap-3 px-4 py-3">
                <ResultChip r={p.result} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-bold text-white">{p.title}</span>
                  <span className="block truncate text-[12px] text-zinc-500">
                    {leagueName(p.league)} · {p.game} · {ptTime(p.start)}
                    {p.final ? ` · Final ${p.final}` : ""}
                  </span>
                </span>
                <span className="shrink-0 text-[11px] text-zinc-500">{p.tier}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-[13px] text-zinc-400">No VIP pick has gone final yet. The first finals show here, wins and losses alike.</p>
        )}
      </section>
      <p className="px-1 text-[11px] text-zinc-500">
        Nothing is removed or edited after it locks. W/L/P only. {VIP_NOTE}{" "}
        <Link href="/vip" className="font-bold text-[color:var(--gold)]">
          Today’s VIP picks →
        </Link>
      </p>
    </div>
  );
}
