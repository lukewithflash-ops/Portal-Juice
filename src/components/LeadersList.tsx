"use client";

import { useState } from "react";
import { addPick } from "@/lib/pickStore";
import type { LeaderRow } from "@/lib/leaderRank";
import { SPORT_ORDER, type Sport } from "@/lib/types";

export default function LeadersList({ rows }: { rows: LeaderRow[] }) {
  const [copied, setCopied] = useState<Record<string, number>>({});

  function copy(row: LeaderRow) {
    let n = 0;
    for (const leg of row.open) {
      if (!SPORT_ORDER.includes(leg.sport as Sport)) continue;
      addPick({
        id: crypto.randomUUID(),
        sport: leg.sport as Sport,
        subject: leg.subject,
        line: leg.line,
        odds: 0,
        stake: 0,
        book: "@" + row.handle,
        date: leg.date || new Date().toISOString().slice(0, 10),
        status: "open",
        createdAt: new Date().toISOString(),
        league: leg.league,
        gameId: leg.gameId,
        market: leg.market || undefined,
        selection: leg.selection,
      });
      n++;
    }
    setCopied((c) => ({ ...c, [row.handle]: n }));
  }

  return (
    <ol className="space-y-2">
      {rows.map((r, i) => (
        <li key={r.handle} className={i === 0 ? "gold-edge rounded-2xl" : ""}>
          <div className="foil-tile px-3 py-3">
            <div className="flex items-center gap-3">
              <span className={`w-5 text-center tabular text-sm font-black ${i === 0 ? "tone-gold" : "text-zinc-500"}`}>{i + 1}</span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[15px] font-bold text-[color:var(--flat)]">@{r.handle}</div>
                <div className="text-[12px] text-zinc-400">
                  {r.wins}–{r.losses}
                  {r.pushes ? `–${r.pushes}` : ""} across {r.sample} graded lines
                </div>
              </div>
              <div className="text-right">
                <div className={`tabular text-lg font-black ${i === 0 ? "tone-gold" : "text-[color:var(--plus)]"}`}>{r.hitRate}%</div>
                <div className="text-[10px] uppercase tracking-wider text-zinc-500">hit rate</div>
              </div>
            </div>
            {r.open.length ? (
              <>
                <ul className="mt-2 space-y-0.5 text-[12px] text-zinc-300">
                  {r.open.slice(0, 5).map((l, j) => (
                    <li key={j} className="truncate">
                      {l.subject} {l.selection ? l.selection + " " : ""}
                      {l.line} {l.market}
                    </li>
                  ))}
                  {r.open.length > 5 ? <li className="text-zinc-500">+{r.open.length - 5} more</li> : null}
                </ul>
                <button
                  type="button"
                  onClick={() => copy(r)}
                  className="mt-2 rounded-lg border border-[color:var(--gold)]/50 px-3 py-1.5 text-xs font-bold text-[color:var(--flat)]"
                >
                  {copied[r.handle] !== undefined ? `Copied ${copied[r.handle]} to your Log` : `Copy ${r.open.length} open lines to my Log`}
                </button>
              </>
            ) : (
              <p className="mt-2 text-[11px] text-zinc-500">No open lines shared right now.</p>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}
