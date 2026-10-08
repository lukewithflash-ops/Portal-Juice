"use client";

import { useEffect, useRef } from "react";
import { fmtLine, fmtOdds } from "@/lib/odds";
import { ptDayTime } from "@/lib/time";
import type { LineRow } from "@/lib/types";

/** Tap target for a line card: the print history and nothing else. */
export default function PrintHistory({
  row,
  onClose,
}: {
  row: LineRow | null;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (row && !d.open) d.showModal();
    if (!row && d.open) d.close();
  }, [row]);

  const signed = row?.selection === null;
  const prints = row ? [...row.prints].reverse() : [];

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      className="m-auto w-[min(92vw,26rem)] rounded-2xl border border-purple-500/30 bg-[#0b0714] p-0 text-[color:var(--flat)] backdrop:bg-black/70 backdrop:backdrop-blur-sm"
    >
      {row && (
        <div className="p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-purple-300/80">
                Print history
              </p>
              <h2 className="mt-1 truncate text-base font-bold">{row.subject}</h2>
              <p className="text-xs text-zinc-400">
                {row.market} {row.selection ?? ""} · {row.book}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-full border border-zinc-700 px-2.5 py-1 text-xs text-zinc-300 hover:border-purple-400/60"
            >
              Close
            </button>
          </div>
          {prints.length === 0 ? (
            <p className="mt-5 text-sm text-zinc-400">No prints stored for this line yet.</p>
          ) : (
            <ol className="mt-4 max-h-[60vh] space-y-1.5 overflow-y-auto">
              {prints.map((p, i) => (
                <li
                  key={`${p.at}-${i}`}
                  className="flex items-center justify-between rounded-lg border border-purple-500/15 bg-black/30 px-3 py-2 text-sm"
                >
                  <span className="text-xs text-zinc-400">{ptDayTime(p.at)}</span>
                  <span className="tabular font-semibold">{fmtLine(p.line, signed)}</span>
                  <span className="tabular w-16 text-right font-bold">{fmtOdds(p.juice)}</span>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </dialog>
  );
}
