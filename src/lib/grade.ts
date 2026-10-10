/** Auto-grade a logged pick from a final ESPN snapshot. Pure. Null = can't grade yet. */
import type { LiveSnap } from "@/lib/live";
import type { Pick as LoggedPick, PickStatus } from "@/lib/types";
import { liveStat, playerByName } from "@/lib/tracker";

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();

/** Which side the subject names: "away" | "home" | null. */
export function sideOf(subject: string, snap: Pick<LiveSnap, "awayAbbr" | "homeAbbr" | "awayName" | "homeName">): "away" | "home" | null {
  const s = norm(subject);
  if (!s) return null;
  const hit = (abbr: string, name?: string | null) => {
    const a = norm(abbr);
    const n = norm(name ?? "");
    const words = s.split(" ");
    return words.includes(a) || (!!n && (s === n || n.includes(s) || s.includes(n) || n.split(" ").slice(-1)[0] === words.slice(-1)[0]));
  };
  const away = hit(snap.awayAbbr, snap.awayName);
  const home = hit(snap.homeAbbr, snap.homeName);
  return away && !home ? "away" : home && !away ? "home" : null;
}

const cmp = (a: number, b: number): PickStatus => (a > b ? "win" : a < b ? "loss" : "push");

export function gradePick(pick: LoggedPick, snap: LiveSnap | null): PickStatus | null {
  if (!snap || snap.state !== "post" || pick.status !== "open") return null;
  const market = (pick.market ?? "").toLowerCase();
  const away = Number(snap.awayScore);
  const home = Number(snap.homeScore);
  const scored = snap.awayScore != null && snap.homeScore != null && Number.isFinite(away) && Number.isFinite(home);
  if (market === "total") {
    if (!scored || !(pick.line > 0)) return null;
    const r = cmp(away + home, pick.line);
    return pick.selection === "Under" ? (r === "win" ? "loss" : r === "loss" ? "win" : "push") : r;
  }
  if (market === "moneyline" || market === "spread") {
    if (!scored) return null;
    const side = sideOf(pick.subject, snap);
    if (!side) return null;
    const mine = side === "away" ? away : home;
    const theirs = side === "away" ? home : away;
    if (market === "moneyline") return mine > theirs ? "win" : "loss"; // a draw loses a 2-way or 3-way side
    return cmp(mine + pick.line, theirs);
  }
  if (!market || !(pick.line > 0)) return null;
  const player = playerByName(snap.boxes, pick.subject);
  if (!player) return null;
  const v = liveStat(player.statMap, pick.market ?? "", snap.plays, player.name);
  if (v === null) return player.played === false ? "loss" : null;
  const r = cmp(v, pick.line);
  return pick.selection === "Under" ? (r === "win" ? "loss" : r === "loss" ? "win" : "push") : r;
}
