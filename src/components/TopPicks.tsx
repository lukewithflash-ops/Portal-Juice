"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import Mark from "@/components/Mark";
import { LEAN_NOTE, checkHref } from "@/lib/breakdown";
import { pickFromLeg } from "@/lib/legPick";
import { addPick } from "@/lib/pickStore";
import type { TopPicks as Data } from "@/lib/topRank";

/** A game's three best-leaning legs from Breakdown. Gold for #1, green for the rest. */
export default function TopPicks({
  league,
  id,
  home,
  away,
  live = false,
  compact = false,
}: {
  league: string;
  id: string;
  home: string;
  away: string;
  live?: boolean;
  compact?: boolean;
}) {
  const [data, setData] = useState<Data | null>(null);
  const [failed, setFailed] = useState(false);
  const [added, setAdded] = useState<Record<number, boolean>>({});

  useEffect(() => {
    let dead = false;
    fetch(`/api/picks/${league}/${id}${live ? "?live=1" : ""}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: Data) => !dead && setData(d))
      .catch(() => !dead && setFailed(true));
    return () => {
      dead = true;
    };
  }, [league, id, live]);

  const body = !data ? (
    <p className="text-[12px] text-zinc-500">{failed ? "Could not load picks." : "Running the numbers…"}</p>
  ) : (
    <>
      {data.picks.length ? (
        <ol className={compact ? "space-y-1.5" : "space-y-2"}>
          {data.picks.map((p) => {
            const color = p.rank === 1 ? "var(--gold)" : "var(--plus)";
            return (
              <li
                key={p.rank}
                className={`rounded-xl border bg-black/25 ${compact ? "px-2.5 py-2" : "px-3 py-2.5"} ${p.rank === 1 ? "gold-edge" : ""}`}
                style={{ borderColor: `color-mix(in srgb, ${color} 45%, transparent)` }}
              >
                <div className="flex items-start gap-2">
                  <span className="tabular mt-0.5 w-4 flex-none text-center text-sm font-black" style={{ color }}>
                    {p.rank}
                  </span>
                  {!compact && p.mark ? <Mark team={p.mark.abbr} headshotUrl={p.mark.img} label={p.title} size={34} contain={p.mark.logo} /> : null}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className={`truncate font-bold text-[color:var(--flat)] ${compact ? "text-[13px]" : "text-sm"}`}>{p.title}</span>
                      {p.implied != null ? (
                        <span className="tabular flex-none text-[11px] text-zinc-400">
                          {p.odds != null ? `${p.odds > 0 ? "+" : ""}${p.odds} · ` : ""}
                          {Math.round(p.implied * 100)}%
                        </span>
                      ) : null}
                    </div>
                    <p className={`leading-snug ${compact ? "text-[11px]" : "text-[12px]"}`} style={{ color }}>
                      + {p.reason}
                    </p>
                    <div className="mt-1 flex items-center gap-3 text-[11px]">
                      <span className="text-zinc-500">
                        {p.pros} pro{p.pros === 1 ? "" : "s"} · {p.cons} con{p.cons === 1 ? "" : "s"}
                      </span>
                      <Link href={checkHref([p.leg])} className="relative z-10 font-bold text-purple-200/90 hover:text-white">
                        Analyze
                      </Link>
                      <button
                        type="button"
                        disabled={added[p.rank]}
                        onClick={() => {
                          addPick(pickFromLeg({ ...p.leg, odds: p.odds }, { home, away }));
                          setAdded((a) => ({ ...a, [p.rank]: true }));
                        }}
                        className="relative z-10 font-bold text-[color:var(--plus)] disabled:text-zinc-500"
                      >
                        {added[p.rank] ? "In your log ✓" : "Add to log"}
                      </button>
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      ) : null}
      {data.note ? <p className="mt-1.5 text-[11px] text-zinc-500">{data.note}</p> : null}
      <p className="mt-1.5 text-[10px] text-zinc-500">{LEAN_NOTE}</p>
    </>
  );

  if (compact) return <div className="relative z-10 mt-2">{body}</div>;
  return (
    <section aria-label="3 favorite picks" className="foil-tile mb-4 p-4">
      <div className="mb-2 flex items-baseline justify-between">
        <h2 className="text-[10px] font-black uppercase tracking-[0.2em] tone-gold">3 favorite picks</h2>
        <span className="text-[10px] text-zinc-500">From Breakdown</span>
      </div>
      {body}
    </section>
  );
}
