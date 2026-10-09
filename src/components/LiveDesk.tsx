"use client";

import { useMemo, useRef, useState } from "react";
import { OddsText } from "@/components/Prefs";
import { isBehind, type LiveBox, type LiveSnap } from "@/lib/live";
import { POLL_ERROR_MS, pollDelay, usePoll } from "@/components/usePoll";

export default function LiveDesk({ league, id }: { league: string; id: string }) {
  const [snap, setSnap] = useState<LiveSnap | null>(null);
  const [fresh, setFresh] = useState<string | null>(null);
  const [sort, setSort] = useState(0);
  const last = useRef<string | null>(null);
  const snapRef = useRef<LiveSnap | null>(null);

  usePoll(async (signal) => {
    const res = await fetch("/api/live/" + league + "/" + id, { cache: "no-store", signal });
    if (!res.ok) return POLL_ERROR_MS;
    const data = (await res.json()) as LiveSnap;
    if (isBehind(data, snapRef.current)) return pollDelay(snapRef.current?.state);
    snapRef.current = data;
    const newest = data.plays.length ? data.plays[data.plays.length - 1].id : null;
    if (last.current && newest && newest !== last.current) setFresh(newest);
    last.current = newest;
    setSnap(data);
    return pollDelay(data.state);
  }, league + "/" + id);

  if (!snap || (snap.state === "pre" && snap.plays.length === 0 && snap.boxes.length === 0)) return null;

  const plays = [...snap.plays].reverse().slice(0, 12);
  const spot = [...snap.plays].reverse().find((p) => p.yardsToEndzone !== null);
  const ball = spot?.yardsToEndzone;

  return (
    <section className="mt-4 space-y-3" aria-label="Live">
      <div className="foil-tile p-3">
        <div className="flex items-center justify-between gap-2">
          <span className={snap.state === "in" ? "pill pill-win" : "pill pill-push"}>
            {snap.state === "in" ? "Live" : snap.state === "post" ? "Final" : "Soon"}
            {snap.clock ? " " + snap.clock : ""}
          </span>
          <span className="text-[11px] text-zinc-500">{snap.detail}</span>
        </div>
        <p className="big-num mt-2 text-4xl font-black text-[color:var(--flat)]">
          <span style={{ color: snap.awayColor }}>{snap.awayAbbr}</span> {snap.awayScore ?? "0"}
          <span className="mx-2 text-zinc-600">·</span>
          {snap.homeScore ?? "0"} <span style={{ color: snap.homeColor }}>{snap.homeAbbr}</span>
        </p>
        {snap.homeWin !== null && (
          <div className="mt-3">
            <div className="mb-1 flex justify-between text-[10px] uppercase tracking-wider text-zinc-500">
              <span>{snap.awayAbbr} {(100 - snap.homeWin).toFixed(0)}%</span>
              <span>Win chance</span>
              <span>{snap.homeWin.toFixed(0)}% {snap.homeAbbr}</span>
            </div>
            <div className="flex h-2 overflow-hidden rounded-full bg-white/10">
              <div style={{ width: snap.homeWin + "%", background: snap.homeColor }} />
            </div>
          </div>
        )}
        {typeof ball === "number" && (
          <div className="mt-3">
            <div className="mb-1 text-[10px] uppercase tracking-wider text-zinc-500">Ball spot</div>
            <div className="relative h-3 rounded-full bg-white/10">
              <div
                className="absolute top-1/2 h-3 w-3 -translate-y-1/2 rounded-full"
                style={{ left: "calc(" + (100 - ball) + "% - 6px)", background: snap.homeColor }}
              />
            </div>
          </div>
        )}
        {(snap.total !== null || snap.awayMl || snap.homeMl) && (
          <p className="mt-3 text-xs text-zinc-300">
            {snap.total !== null && (
              <span className="tabular">
                Total {snap.total}
                {snap.totalOpen !== null && snap.totalOpen !== snap.total ? " (opened " + snap.totalOpen + ")" : ""}
              </span>
            )}
            {(snap.awayMl || snap.homeMl) && (
              <span className="ml-2 tabular">
                {snap.awayAbbr} <OddsText value={snap.awayMl} /> · {snap.homeAbbr} <OddsText value={snap.homeMl} />
              </span>
            )}
            {snap.provider ? <span className="ml-2 text-zinc-500">{snap.provider}</span> : null}
          </p>
        )}
      </div>

      {plays.length > 0 && (
        <ol className="space-y-1.5">
          {plays.map((p) => {
            const color = p.teamId === snap.homeId ? snap.homeColor : p.teamId === snap.awayId ? snap.awayColor : "#a1a1aa";
            return (
              <li
                key={p.id}
                className={
                  "foil-tile px-3 py-2 text-sm " +
                  (p.id === fresh ? "play-pop " : "") +
                  (p.scoring ? "score-flash" : "")
                }
                style={p.scoring ? ({ ["--flash" as string]: color } as React.CSSProperties) : undefined}
              >
                <div className="flex items-baseline justify-between gap-2 text-[10px] uppercase tracking-wider text-zinc-500">
                  <span style={{ color }}>{p.period} {p.clock}</span>
                  {p.scoring ? <span className="font-bold" style={{ color }}>+{p.points}</span> : null}
                </div>
                <p className="mt-0.5 text-[color:var(--flat)]">{p.text}</p>
              </li>
            );
          })}
        </ol>
      )}

      {snap.boxes.map((box) => (
        <Box key={box.abbr} box={box} sort={sort} onSort={setSort} />
      ))}
    </section>
  );
}

function Box({ box, sort, onSort }: { box: LiveBox; sort: number; onSort: (n: number) => void }) {
  const players = useMemo(() => {
    const rows = box.players.filter((p) => p.played);
    if (sort <= 0 || sort > box.columns.length) return rows;
    const idx = sort - 1;
    return [...rows].sort((a, b) => num(b.stats[idx]) - num(a.stats[idx]));
  }, [box, sort]);
  return (
    <div className="foil-tile overflow-x-auto p-2">
      <p className="px-1 text-xs font-bold uppercase tracking-wider" style={{ color: box.color }}>
        {box.abbr}
      </p>
      <table className="mt-1 w-full text-left text-[11px]">
        <thead>
          <tr className="text-zinc-500">
            <th className="px-1 py-1 font-semibold">Player</th>
            {box.columns.map((c, i) => (
              <th key={c + i} className="px-1 py-1 font-semibold">
                <button type="button" className="tabular" onClick={() => onSort(i + 1)}>
                  {c}
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {players.map((p) => (
            <tr key={p.id} className="border-t border-white/5 text-zinc-200">
              <td className="px-1 py-1 font-semibold text-[color:var(--flat)]">{p.name}</td>
              {box.columns.map((_, i) => (
                <td key={i} className="tabular px-1 py-1">{p.stats[i] ?? ""}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function num(v: string | undefined): number {
  const n = Number(String(v ?? "").replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}
