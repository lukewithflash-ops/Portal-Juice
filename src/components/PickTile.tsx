"use client";

import CountUp from "@/components/CountUp";
import Mark from "@/components/Mark";
import { fmtLine } from "@/lib/odds";
import { removePick, setStatus } from "@/lib/pickStore";
import { shortDate } from "@/lib/time";
import type { Pick, PickStatus } from "@/lib/types";

const STATUSES: PickStatus[] = ["open", "win", "loss", "push"];

/** Same ticket as /lines: odds largest → line → name. Status is the user's own record. */
export default function PickTile({ pick }: { pick: Pick }) {
  return (
    <article className="foil-tile p-4">
      <div className="flex items-start gap-3">
        <Mark team="" label={pick.subject} size={44} />
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-bold text-[color:var(--flat)]">{pick.subject}</h3>
          <p className="mt-0.5 truncate text-[11px] text-zinc-400">
            {pick.sport} · {pick.book} · {shortDate(pick.date)} · stake {pick.stake}
          </p>
        </div>
        <span className={`pill pill-${pick.status}`}>{pick.status}</span>
      </div>

      <div className="ticket-rule mt-3 flex items-end justify-between gap-3 pt-3">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">Odds</div>
          <CountUp
            value={pick.odds}
            kind="odds"
            className="big-num block text-5xl font-black text-[color:var(--flat)]"
          />
        </div>
        <div className="text-right">
          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">Line</div>
          <span className="big-num block text-3xl font-extrabold text-[color:var(--flat)]">
            {fmtLine(pick.line, pick.line < 0)}
          </span>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between gap-2">
        <div className="flex gap-1" role="group" aria-label="Status">
          {STATUSES.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatus(pick.id, s)}
              aria-pressed={pick.status === s}
              className={`rounded-md border px-2 py-1 text-[10px] font-bold uppercase tracking-wider ${
                pick.status === s ? `pill-${s}` : "border-zinc-700/70 text-zinc-500 hover:text-zinc-300"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => removePick(pick.id)}
          className="text-[11px] text-zinc-500 underline-offset-2 hover:text-zinc-300 hover:underline"
        >
          Remove
        </button>
      </div>
    </article>
  );
}
