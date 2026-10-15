/** The night's logged picks, counted W/L/P. Pure. No money, units, or net. */
import type { Pick } from "@/lib/types";

export type NightRow = { s: string; r: "W" | "L" | "P" | "O" };
export type Night = { date: string; w: number; l: number; p: number; open: number; rows: NightRow[] };

export const nightOf = (p: Pick) => p.date || p.createdAt.slice(0, 10);

export function legLabel(p: Pick): string {
  const m = (p.market ?? "").trim();
  const line = p.line ? String(p.line) : "";
  const side = p.selection ? `${p.selection} ` : "";
  if (/moneyline|^ml$/i.test(m)) return `${p.subject} ML`.slice(0, 48);
  if (/spread/i.test(m)) return `${p.subject} ${p.line > 0 ? "+" : ""}${line}`.slice(0, 48);
  return `${p.subject} ${side}${line}${m ? " " + m : ""}`.replace(/\s+/g, " ").trim().slice(0, 48);
}

const R: Record<Pick["status"], NightRow["r"]> = { win: "W", loss: "L", push: "P", open: "O" };

export function nightTally(picks: Pick[], date: string): Night {
  const mine = picks.filter((p) => nightOf(p) === date);
  return {
    date,
    w: mine.filter((p) => p.status === "win").length,
    l: mine.filter((p) => p.status === "loss").length,
    p: mine.filter((p) => p.status === "push").length,
    open: mine.filter((p) => p.status === "open").length,
    rows: mine
      .slice()
      .sort((a, b) => "WLPO".indexOf(R[a.status]) - "WLPO".indexOf(R[b.status]))
      .map((p) => ({ s: legLabel(p), r: R[p.status] })),
  };
}

/** Nights that have logged picks, newest first. */
export function nights(picks: Pick[], max = 6): string[] {
  return [...new Set(picks.map(nightOf))].filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort().reverse().slice(0, max);
}

/** Query string for the share image. Only the counts and short leg labels leave the device, and only on tap. */
export function nightQuery(n: Night): string {
  const q = new URLSearchParams({ d: n.date, w: String(n.w), l: String(n.l), p: String(n.p), o: String(n.open) });
  q.set("r", n.rows.slice(0, 8).map((r) => `${r.r}~${r.s.replace(/[~|]/g, " ")}`).join("|"));
  return q.toString();
}

export function parseNightQuery(q: URLSearchParams): Night | null {
  const d = q.get("d") ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return null;
  const n = (k: string) => Math.max(0, Math.min(99, Math.floor(Number(q.get(k)) || 0)));
  const rows = (q.get("r") ?? "")
    .split("|")
    .slice(0, 8)
    .map((x) => {
      const [r, ...rest] = x.split("~");
      const s = rest.join(" ").replace(/[^\p{L}\p{N} .,'+\-/()&]/gu, "").trim().slice(0, 48);
      return r && "WLPO".includes(r) && r.length === 1 && s ? { r: r as NightRow["r"], s } : null;
    })
    .filter((x): x is NightRow => x !== null);
  return { date: d, w: n("w"), l: n("l"), p: n("p"), open: n("o"), rows };
}

export function nightName(date: string, today: string): string {
  if (date === today) return "Tonight";
  const t = new Date(today + "T12:00:00");
  t.setDate(t.getDate() - 1);
  const y = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
  if (date === y) return "Last night";
  const d = new Date(date + "T12:00:00");
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}
