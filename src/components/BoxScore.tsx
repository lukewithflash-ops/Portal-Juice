"use client";
/** ESPN-style full box score, Portal themed. Every number is ESPN's; no box from ESPN shows a clean empty state. */
import { memo, useCallback, useEffect, useRef, useState } from "react";
import type { BoxScore as Box, BoxGroup } from "@/lib/boxScore";
import { useYourPlayers } from "@/components/YourPlayers";
import { mentions } from "@/lib/yourPlayers";

export default memo(BoxScore);

function BoxScore({ league, id, live }: { league: string; id: string; live?: boolean }) {
  const [box, setBox] = useState<Box | null>(null);
  const [err, setErr] = useState(false);
  const [side, setSide] = useState(0);
  const [view, setView] = useState<"players" | "team">("players");
  const { names } = useYourPlayers();
  const nameKey = names.join("|");
  const ref = useRef<HTMLElement>(null);
  const last = useRef("");
  const isLive = box ? box.state === "in" : !!live;

  useEffect(() => {
    let stop = false;
    let t: ReturnType<typeof setTimeout> | undefined;
    let seen = true;
    let wanted = false;
    let state = "";
    const due = () => (state === "in" ? 12000 : state === "pre" ? 60000 : 0);
    const later = (ms: number) => {
      clearTimeout(t);
      t = ms ? setTimeout(tick, ms) : undefined;
    };
    // Off screen or app in the background: wait, then pull fresh the moment it's back in view.
    const tick = () => {
      if (stop) return;
      if (!seen || document.hidden) {
        wanted = true;
        return;
      }
      load();
    };
    const wake = () => {
      if (wanted && seen && !document.hidden) {
        wanted = false;
        load();
      }
    };
    const io = typeof IntersectionObserver === "function" && ref.current
      ? new IntersectionObserver((e) => {
          seen = e.some((x) => x.isIntersecting);
          wake();
        }, { rootMargin: "400px 0px" })
      : null;
    if (io && ref.current) io.observe(ref.current);
    document.addEventListener("visibilitychange", wake);
    const load = async () => {
      try {
        const r = await fetch(`/api/box/${league}/${id}`);
        if (!r.ok) throw new Error();
        const text = await r.text();
        const b = JSON.parse(text) as Box;
        state = b.state;
        if (!stop && text !== last.current) {
          last.current = text;
          setBox(b);
        }
        if (!stop) setErr(false);
        if (!stop) later(due());
      } catch {
        if (!stop) {
          setErr(true);
          later(20000);
        }
      }
    };
    load();
    return () => {
      stop = true;
      clearTimeout(t);
      io?.disconnect();
      document.removeEventListener("visibilitychange", wake);
    };
  }, [league, id]);

  const team = box?.teams[side] ?? null;
  const has = !!box && (box.teams.length > 0 || box.teamStats.length > 0);
  // Stable across live-feed renders so memoized tables skip work unless the box or your players change.
  const mine = useCallback((n: string) => (nameKey ? nameKey.split("|").some((x) => mentions(n, x) || mentions(x, n)) : false), [nameKey]);

  return (
    <section ref={ref} className="foil-tile box-score mt-4 p-3" aria-label="Box score" data-testid="box-score">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-[11px] font-black uppercase tracking-[0.2em] text-purple-200/80">
          Box score {isLive ? <span className="box-live ml-1">● Live</span> : box?.state === "post" ? <span className="ml-1 text-zinc-500">· Final</span> : null}
        </h2>
        {has && box!.teams.length && box!.teamStats.length ? (
          <div className="flex gap-1 text-[10px] font-bold uppercase tracking-wider">
            {(["players", "team"] as const).map((v) => (
              <button key={v} type="button" onClick={() => setView(v)} className={"rounded-md px-2 py-1 " + (view === v ? "bg-white/10 text-white" : "text-zinc-500")}>
                {v === "players" ? "Players" : "Team"}
              </button>
            ))}
          </div>
        ) : null}
      </div>
      {!box && !err ? <div className="box-skel mt-3" aria-hidden /> : null}
      {err && !box ? <p className="mt-2 text-sm text-zinc-500">ESPN&apos;s box score isn&apos;t loading right now. Trying again shortly.</p> : null}
      {box && !has ? (
        <p className="mt-2 text-sm text-zinc-500">{box.state === "pre" ? "The box score fills in once the game starts." : "ESPN doesn't post a box score for this one."}</p>
      ) : null}
      {has && (view === "players" || !box!.teamStats.length) && box!.teams.length ? (
        <>
          <div className="mt-2 flex gap-1">
            {box!.teams.map((t, i) => (
              <button
                key={t.id + i}
                type="button"
                onClick={() => setSide(i)}
                className={"flex-1 rounded-lg px-2 py-1.5 text-[12px] font-black uppercase tracking-wider transition " + (side === i ? "text-white" : "text-zinc-500")}
                style={side === i ? { background: `color-mix(in srgb, ${t.color} 28%, transparent)`, boxShadow: `inset 0 0 0 1px ${t.color}, 0 0 14px -4px ${t.color}` } : { background: "rgba(255,255,255,0.04)" }}
              >
                {t.abbr}
              </button>
            ))}
          </div>
          {team ? team.groups.map((g, i) => <Group key={team.id + g.title + i} g={g} color={team.color} mine={mine} />) : null}
        </>
      ) : null}
      {has && view === "team" && box!.teamStats.length ? <TeamTable box={box!} /> : null}
      {has && !box!.teams.length && box!.teamStats.length ? <TeamTable box={box!} /> : null}
    </section>
  );
}

const Group = memo(function Group({ g, color, mine }: { g: BoxGroup; color: string; mine: (n: string) => boolean }) {
  return (
    <div className="mt-3">
      <p className="mb-1 text-[10px] font-black uppercase tracking-[0.18em]" style={{ color }}>{g.title}</p>
      <div className="box-scroll">
        <table className="box-table tabular">
          <thead>
            <tr>
              <th className="box-name">Player</th>
              {g.labels.map((l, i) => <th key={l + i}>{l}</th>)}
            </tr>
          </thead>
          <tbody>
            {g.rows.map((r, ri) => {
              const m = mine(r.name);
              return (
                <tr key={r.id + ri} className={m ? "box-mine gold-edge" : ""}>
                  <td className="box-name">
                    <span className="font-bold text-zinc-100">{m ? "⭐ " : ""}{r.short}</span>
                    <span className="ml-1 text-[10px] text-zinc-500">{r.pos}{r.jersey ? ` #${r.jersey}` : ""}</span>
                  </td>
                  {r.stats.length ? r.stats.map((v, i) => <td key={i}>{v === "" ? "–" : v}</td>) : <td colSpan={g.labels.length} className="text-[11px] uppercase tracking-wider text-zinc-500" style={{ textAlign: "left" }}>{r.note ?? "Did not play"}</td>}
                </tr>
              );
            })}
            {g.totals ? (
              <tr className="box-total">
                <td className="box-name font-black">Team</td>
                {g.totals.map((v, i) => <td key={i}>{v}</td>)}
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
});

function TeamTable({ box }: { box: Box }) {
  const [a, h] = [box.teams[0]?.abbr ?? "Away", box.teams[1]?.abbr ?? "Home"];
  return (
    <table className="mt-2 w-full text-[13px] tabular">
      <thead>
        <tr className="text-[10px] uppercase tracking-wider text-zinc-500">
          <th className="text-left">{a}</th>
          <th />
          <th className="text-right">{h}</th>
        </tr>
      </thead>
      <tbody>
        {box.teamStats.map((s) => (
          <tr key={s.label} className="border-t border-white/5">
            <td className="py-1 font-bold text-zinc-100">{s.away}</td>
            <td className="text-center text-zinc-400">{s.label}</td>
            <td className="text-right font-bold text-zinc-100">{s.home}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
