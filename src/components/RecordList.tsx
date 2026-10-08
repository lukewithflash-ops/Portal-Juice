"use client";

import CountUp from "@/components/CountUp";
import Mark from "@/components/Mark";
import { fmtLine } from "@/lib/odds";
import { PAST_HITS } from "@/lib/site";
import { shortDate } from "@/lib/time";

export type RecordItem = {
  key: string;
  subject: string;
  team: string;
  market: string;
  /** Streak length, or hit-rate percent. */
  stat: number;
  statKind: "streak" | "rate";
  /** e.g. "9 of 12" for rate rows */
  detail?: string;
  sample: number;
  lastLine: number;
  lastLineSigned: boolean;
  lastDate: string;
  headshotUrl: string | null;
};

/** One ranked list on /lines/board. No money anywhere. */
export default function RecordList({
  title,
  blurb,
  items,
  empty,
}: {
  title: string;
  blurb: string;
  items: RecordItem[];
  empty: string;
}) {
  return (
    <section className="panel mt-6 rounded-2xl p-4 sm:p-5" aria-label={title}>
      <h2 className="text-sm font-black uppercase tracking-[0.2em] text-[color:var(--flat)]">{title}</h2>
      <p className="mt-1 text-xs text-zinc-500">{blurb}</p>

      {items.length === 0 ? (
        <p className="mt-4 text-sm text-zinc-400">{empty}</p>
      ) : (
        <ol className="mt-4 space-y-2">
          {items.map((it, i) => (
            <li key={it.key} className="foil-card flex items-center gap-3 px-3 py-2.5">
              <span className="tabular w-5 text-right text-xs font-bold text-zinc-500">{i + 1}</span>
              <Mark team={it.team} headshotUrl={it.headshotUrl} label={it.subject} size={38} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-bold text-[color:var(--flat)]">{it.subject}</div>
                <div className="truncate text-[11px] text-zinc-400">
                  {it.market} · last line{" "}
                  <span className="tabular text-zinc-300">{fmtLine(it.lastLine, it.lastLineSigned)}</span>{" "}
                  · {shortDate(it.lastDate)}
                </div>
              </div>
              <div className="text-right">
                <CountUp
                  value={it.stat}
                  kind={it.statKind === "rate" ? "pct" : "int"}
                  className="big-num block text-2xl font-black text-[color:var(--plus)]"
                />
                <div className="tabular text-[10px] uppercase tracking-wider text-zinc-500">
                  {it.statKind === "streak" ? "straight" : it.detail} · n={it.sample}
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}
      <p className="mt-4 border-t border-purple-500/15 pt-3 text-[11px] text-zinc-500">{PAST_HITS}</p>
    </section>
  );
}
