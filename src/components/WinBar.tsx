import type { WinPct } from "@/lib/winPct";

const FALLBACK = { away: "a78bfa", home: "4ade80" };

const rgb = (h: string) => [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
/** True when two hex colors are hard to tell apart side by side. */
export function closeColors(a: string, b: string): boolean {
  const [x, y] = [rgb(a), rgb(b)];
  return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]) < 120;
}

/** Team colors for the bar; the away side switches to its alternate (or a neutral) when the two clash. */
export function barColors(away?: string | null, awayAlt?: string | null, home?: string | null): { away: string; home: string } {
  const h = home || FALLBACK.home;
  let a = away || FALLBACK.away;
  if (closeColors(a, h)) a = awayAlt && !closeColors(awayAlt, h) ? awayAlt : closeColors("e4e4e7", h) ? "52525b" : "e4e4e7";
  return { away: a, home: h };
}

/** Split bar in team colors. Shows only what the source gave. */
export default function WinBar({
  win,
  away,
  home,
  awayColor,
  awayAlt,
  homeColor,
  compact = false,
}: {
  win: WinPct;
  away: string;
  home: string;
  awayColor?: string | null;
  awayAlt?: string | null;
  homeColor?: string | null;
  compact?: boolean;
}) {
  const c = barColors(awayColor, awayAlt, homeColor);
  const ac = "#" + c.away;
  const hc = "#" + c.home;
  const pct = (n: number) => `${n.toFixed(n % 1 === 0 ? 0 : 1)}%`;
  return (
    <div className={compact ? "mt-2" : "mt-3"} data-testid="win-bar">
      <div className={"flex items-baseline justify-between font-black tabular text-[color:var(--flat)] " + (compact ? "text-[12px]" : "text-sm")}>
        <span>
          {away} {pct(win.away)}
        </span>
        {win.draw != null ? <span className="text-zinc-400">Draw {pct(win.draw)}</span> : null}
        <span>
          {home} {pct(win.home)}
        </span>
      </div>
      <div className={"mt-1 flex overflow-hidden rounded-full bg-white/5 ring-1 ring-white/10 " + (compact ? "h-1.5" : "h-2.5")} role="img" aria-label={`Win chance: ${away} ${pct(win.away)}${win.draw != null ? `, draw ${pct(win.draw)}` : ""}, ${home} ${pct(win.home)}. ${win.label}.`}>
        <span style={{ width: `${win.away}%`, background: ac }} className="border-r-2 border-[#0b0b12]" />
        {win.draw != null ? <span style={{ width: `${win.draw}%` }} className="border-r-2 border-[#0b0b12] bg-zinc-500" /> : null}
        <span style={{ width: `${win.home}%`, background: hc }} />
      </div>
      <p className="mt-1 text-[10px] text-zinc-500">{win.label}. Not a guarantee.</p>
    </div>
  );
}
