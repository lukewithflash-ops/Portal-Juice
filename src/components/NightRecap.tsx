"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { getPicks, getServerPicks, subscribe } from "@/lib/pickStore";
import { nightName, nightQuery, nights, nightTally } from "@/lib/nightly";
import { shareImageNative } from "@/lib/native";

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function Tick({ to, delay }: { to: number; delay: number }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches || to === 0) {
      const id = requestAnimationFrame(() => setN(to));
      return () => cancelAnimationFrame(id);
    }
    let i = 0;
    let t: ReturnType<typeof setTimeout>;
    const step = () => {
      i += 1;
      setN(i);
      if (i < to) t = setTimeout(step, Math.max(60, 420 / to));
    };
    t = setTimeout(step, delay);
    return () => clearTimeout(t);
  }, [to, delay]);
  return <>{n}</>;
}

/** The night's logged picks: an arcade W/L/P tally and a shareable PNG. Wins, losses, pushes only. */
export default function NightRecap() {
  const picks = useSyncExternalStore(subscribe, getPicks, getServerPicks);
  const list = useMemo(() => nights(picks), [picks]);
  const [pick, setPick] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const now = today();
  // Default: the newest night with anything settled, else the newest night.
  const auto = list.find((d) => {
    const t = nightTally(picks, d);
    return t.w + t.l + t.p > 0;
  }) ?? list[0] ?? null;
  const date = pick && list.includes(pick) ? pick : auto;
  if (!date) return null;
  const night = nightTally(picks, date);
  const settled = night.w + night.l + night.p;
  const name = nightName(date, now);

  async function share() {
    setBusy(true);
    try {
      const res = await fetch(`/api/nightly?${nightQuery(night)}`);
      if (!res.ok) throw new Error("image");
      const blob = await res.blob();
      const file = new File([blob], `portal-juice-${date}.png`, { type: "image/png" });
      const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
      const label = `${name}: ${night.w}-${night.l}${night.p ? `-${night.p}` : ""}`;
      if (await shareImageNative(blob, file.name, label)) return;
      if (nav.share && nav.canShare?.({ files: [file] })) {
        await nav.share({ files: [file], title: label, text: `${label} via Portal Juice` });
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = file.name;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 4000);
      }
    } catch {
      /* closed or failed */
    } finally {
      setBusy(false);
    }
  }

  const box = (label: string, v: number, cls: string, delay: number) => (
    <div className={"night-slot " + cls}>
      <div className="night-num tabular" key={date + label}>
        <Tick to={v} delay={delay} />
      </div>
      <div className="text-[10px] font-black uppercase tracking-[0.2em] opacity-80">{label}</div>
    </div>
  );

  return (
    <section className="night-recap foil-tile mb-4 p-4" aria-label="Nightly results">
      <span className="portal-ring night-ring" aria-hidden style={{ ["--glow" as string]: night.w > night.l ? "#39ff14" : "#c026ff" } as React.CSSProperties} />
      <div className="relative flex items-center justify-between gap-2">
        <h2 className="text-xs font-black uppercase tracking-[0.22em] text-purple-200/90">{name}&apos;s results</h2>
        {list.length > 1 ? (
          <select className="field !w-auto !py-1 text-xs" value={date} onChange={(e) => setPick(e.target.value)} aria-label="Night">
            {list.map((d) => (
              <option key={d} value={d}>
                {nightName(d, now)}
              </option>
            ))}
          </select>
        ) : null}
      </div>
      <div className="relative mt-3 grid grid-cols-3 gap-2">
        {box("Won", night.w, "is-w", 150)}
        {box("Lost", night.l, "is-l", 450)}
        {box("Push", night.p, "is-p", 750)}
      </div>
      {night.open ? <p className="relative mt-2 text-[11px] text-zinc-400">{night.open} still open. The tally updates as games go final.</p> : null}
      {night.rows.length ? (
        <ul className="relative mt-3 space-y-1">
          {night.rows.slice(0, 8).map((r, i) => (
            <li key={i} className="night-row flex items-center gap-2 text-[12px]" style={{ animationDelay: `${900 + i * 90}ms` }}>
              <span className={"night-pill r-" + r.r}>{r.r === "O" ? "…" : r.r}</span>
              <span className="min-w-0 truncate text-[color:var(--flat)]">{r.s}</span>
            </li>
          ))}
          {night.rows.length > 8 ? <li className="text-[11px] text-zinc-500">+{night.rows.length - 8} more</li> : null}
        </ul>
      ) : null}
      <div className="relative mt-3 flex items-center justify-between gap-2">
        <span className="text-[10px] text-zinc-500">From your Log on this device. Wins, losses, pushes only.</span>
        {settled ? (
          <button type="button" onClick={share} disabled={busy} className="share-final rounded-lg px-3 py-1.5 text-xs font-black text-white">
            <span className="portal-ring" aria-hidden style={{ width: "0.9rem", height: "0.9rem", ["--glow" as string]: "#39ff14" } as React.CSSProperties} />
            {busy ? "Making image…" : `Share ${name.toLowerCase() === "tonight" ? "tonight" : "the night"}`}
          </button>
        ) : null}
      </div>
    </section>
  );
}
