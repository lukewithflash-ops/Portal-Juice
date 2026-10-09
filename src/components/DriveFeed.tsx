"use client";

import { useState } from "react";
import type { LiveDrive, LivePlay, LiveSnap } from "@/lib/live";
import { isBigPlay, playKind, type PlayKind } from "@/lib/tracker";

const ICON: Partial<Record<PlayKind, string>> = {
  td: "🏈", fg: "🥅", pass: "➶", rush: "➜", sack: "✖", punt: "⤴", pick: "🛑", turnover: "⇄", penalty: "⚑", period: "⏱",
};

function resultTone(r: string | null): { color: string; label: string } | null {
  if (!r) return null;
  const t = r.toUpperCase();
  if (/TD|TOUCHDOWN/.test(t)) return { color: "var(--gold)", label: "TD" };
  if (/^FG$|FIELD GOAL$/.test(t) && !/MISS|BLOCK/.test(t)) return { color: "var(--plus)", label: "FG" };
  if (/SAF/.test(t)) return { color: "var(--gold)", label: "Safety" };
  if (/INT|FUMB|TURNOVER|DOWNS|MISS|BLOCK/.test(t)) return { color: "var(--minus)", label: r };
  if (/PUNT/.test(t)) return { color: "#a1a1aa", label: "Punt" };
  if (/HALF|END/.test(t)) return { color: "#a1a1aa", label: r };
  return { color: "#a1a1aa", label: r };
}

function yardsLabel(p: LivePlay): string | null {
  if (p.yards == null) return null;
  const k = playKind(p);
  if (p.penalty || k === "period" || k === "punt" || k === "fg" || /kickoff|timeout|extra point|field goal|two-point|two-minute|end of|kneel/i.test(`${p.typeText} ${p.text}`)) return null;
  if (p.penalty && p.yards === 0) return null;
  return (p.yards > 0 ? "+" : "") + p.yards + " yd" + (Math.abs(p.yards) === 1 ? "" : "s");
}

/**
 * Football play-by-play: every snap, grouped by drive, newest drive on top.
 * The live drive stays open; older drives fold.
 */
export default function DriveFeed({
  snap,
  freshIds,
  awayColor,
  homeColor,
}: {
  snap: LiveSnap;
  freshIds: string[];
  awayColor: string;
  homeColor: string;
}) {
  const byId = new Map(snap.plays.map((p) => [p.id, p]));
  const drives = [...snap.drives].filter((d) => d.playIds.length).reverse();
  const total = snap.plays.length;
  const [open, setOpen] = useState<Record<string, boolean>>({});
  if (!drives.length) return null;
  const colorOf = (teamId: string | null) =>
    teamId === snap.homeId ? homeColor : teamId === snap.awayId ? awayColor : "#a1a1aa";

  return (
    <section className="mt-4" aria-label="Play by play">
      <div className="mb-2 flex items-baseline justify-between">
        <h2 className="text-xs font-bold uppercase tracking-[0.18em] text-purple-200/80">Every down</h2>
        <span className="tabular text-[10px] text-zinc-500">
          {total} plays · {drives.length} drives
        </span>
      </div>
      <ol className="space-y-2">
        {drives.map((d, i) => {
          const first = i === 0;
          const expanded = open[d.id] ?? (d.live || first);
          return (
            <li key={d.id} className="overflow-hidden rounded-xl border border-white/10 bg-black/25" style={{ ["--team" as string]: colorOf(d.teamId) } as React.CSSProperties}>
              <DriveHead drive={d} color={colorOf(d.teamId)} expanded={expanded} onToggle={() => setOpen((o) => ({ ...o, [d.id]: !expanded }))} />
              {expanded ? (
                <ol className="space-y-1 px-2 pb-2">
                  {[...d.playIds]
                    .reverse()
                    .map((pid) => byId.get(pid))
                    .filter((p): p is LivePlay => !!p)
                    .map((p, j) => (
                      <PlayRow key={p.id} play={p} color={colorOf(p.teamId)} fresh={freshIds.includes(p.id)} newest={first && j === 0} snap={snap} />
                    ))}
                </ol>
              ) : null}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function DriveHead({ drive, color, expanded, onToggle }: { drive: LiveDrive; color: string; expanded: boolean; onToggle: () => void }) {
  const tone = resultTone(drive.result);
  return (
    <button type="button" onClick={onToggle} aria-expanded={expanded} className="flex w-full items-center gap-2 px-3 py-2 text-left" style={{ borderLeft: `4px solid ${color}` }}>
      {drive.logo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={drive.logo} alt="" width={22} height={22} className="h-5.5 w-5.5 shrink-0" />
      ) : null}
      <span className="text-xs font-black" style={{ color }}>{drive.abbr}</span>
      {drive.live ? (
        <span className="flex items-center gap-1 rounded-full bg-[color:var(--minus)]/20 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider text-white">
          <span className="tv-live-dot" aria-hidden /> Live drive
        </span>
      ) : tone ? (
        <span className="rounded-full px-1.5 py-0.5 text-[10px] font-black uppercase tracking-wider" style={{ color: tone.color, border: `1px solid ${tone.color}` }}>
          {tone.label}
        </span>
      ) : null}
      <span className="tabular ml-auto truncate text-[10px] text-zinc-400">{drive.description}</span>
      <span className="shrink-0 text-xs text-zinc-500" aria-hidden>{expanded ? "▴" : "▾"}</span>
    </button>
  );
}

function PlayRow({ play, color, fresh, newest, snap }: { play: LivePlay; color: string; fresh: boolean; newest: boolean; snap: LiveSnap }) {
  const big = isBigPlay(play);
  const kind = playKind(play);
  const yards = yardsLabel(play);
  const cls =
    "feed-row rounded-l-md bg-white/[0.03] px-2.5 py-1.5 text-[13px] " +
    (fresh ? "feed-spring " : "") +
    (newest ? "newest " : "") +
    (play.scoring ? "score-flash " : "") +
    (big && !play.turnover ? "gold-edge " : "");
  return (
    <li
      className={cls}
      style={
        {
          ["--team" as string]: play.turnover ? "var(--minus)" : color,
          ["--flash" as string]: color,
          ...(play.turnover ? { boxShadow: "inset 0 0 0 1px var(--minus)" } : {}),
        } as React.CSSProperties
      }
    >
      <div className="flex items-center justify-between gap-2 text-[10px] uppercase tracking-wider">
        <span className="font-black text-[color:var(--flat)]">
          {play.downText ?? (play.penalty ? "Penalty" : play.typeText || "")}
        </span>
        <span className="tabular shrink-0 text-zinc-500">
          {play.period.replace(/ Quarter/, "")} {play.clock}
        </span>
      </div>
      <p className="mt-0.5 leading-snug text-[color:var(--flat)]">
        {play.penalty ? (
          <span className="mr-1 text-[color:var(--gold)]" aria-hidden>⚑</span>
        ) : ICON[kind] ? (
          <span className="mr-1" aria-hidden>{ICON[kind]}</span>
        ) : null}
        {play.text}
      </p>
      <div className="mt-0.5 flex items-center gap-2 text-[10px]">
        {yards ? (
          <span className="tabular font-black" style={{ color: (play.yards ?? 0) > 0 ? "var(--plus)" : (play.yards ?? 0) < 0 ? "var(--minus)" : "#a1a1aa" }}>
            {yards}
          </span>
        ) : null}
        {play.turnover ? <span className="font-black uppercase text-[color:var(--minus)]">Turnover</span> : null}
        {play.scoring && play.awayScore !== null && play.homeScore !== null ? (
          <span className="tabular font-black text-[color:var(--gold)]">
            {snap.awayAbbr} {play.awayScore} · {snap.homeAbbr} {play.homeScore}
          </span>
        ) : null}
      </div>
    </li>
  );
}
