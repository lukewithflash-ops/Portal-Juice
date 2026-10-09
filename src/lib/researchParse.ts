/** Pure ESPN parsers for Breakdown. No fetches, so tests can run them. */
import type { PlayerGame, Ranked } from "@/lib/breakdown";

type Dict = Record<string, unknown>;
const asDict = (v: unknown): Dict => (v && typeof v === "object" ? (v as Dict) : {});
const asList = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
const num = (v: unknown): number | null => {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() && Number.isFinite(Number(v.replace(/,/g, "")))) return Number(v.replace(/,/g, ""));
  return null;
};
const r1 = (n: number) => Math.round(n * 10) / 10;

/** Rank helper: rank 1 = highest when `desc`, else lowest. */
export function rankAll(rows: { id: string; value: number }[], desc: boolean): Map<string, Ranked> {
  const sorted = [...rows].sort((a, b) => (desc ? b.value - a.value : a.value - b.value));
  const out = new Map<string, Ranked>();
  sorted.forEach((r, i) => {
    // Ties share the better rank.
    const first = sorted.findIndex((x) => x.value === r.value);
    out.set(r.id, { value: r1(r.value), rank: (first >= 0 ? first : i) + 1, of: sorted.length });
  });
  return out;
}

export type StandRow = { id: string; ppg: number; papg: number; record: string | null };

function walkEntries(node: unknown, out: Dict[]) {
  const d = asDict(node);
  for (const e of asList(asDict(d.standings).entries)) out.push(asDict(e));
  for (const c of asList(d.children)) walkEntries(c, out);
}

/** Points for and against per game for every team, from ESPN standings. */
export function parseStandings(data: unknown): StandRow[] {
  const entries: Dict[] = [];
  walkEntries(data, entries);
  const rows: StandRow[] = [];
  for (const e of entries) {
    const id = str(asDict(e.team).id);
    if (!id) continue;
    const stat = (name: string) => {
      const s = asList(e.stats).map(asDict).find((x) => x.name === name || x.type === name);
      return s ? num(s.value) ?? num(s.displayValue) : null;
    };
    const statText = (name: string) => {
      const s = asList(e.stats).map(asDict).find((x) => x.name === name || x.type === name);
      return s ? str(s.displayValue) : null;
    };
    const games = stat("gamesPlayed") ?? ((stat("wins") ?? 0) + (stat("losses") ?? 0) + (stat("ties") ?? 0) + (stat("otLosses") ?? 0));
    const ppg = stat("avgPointsFor") ?? (games ? (stat("pointsFor") ?? NaN) / games : null);
    const papg = stat("avgPointsAgainst") ?? (games ? (stat("pointsAgainst") ?? NaN) / games : null);
    if (ppg === null || papg === null || !Number.isFinite(ppg) || !Number.isFinite(papg) || !games) continue;
    rows.push({ id, ppg, papg, record: statText("overall") });
  }
  return rows;
}

/** Value for one game-log row. "3-7" counts makes. PRA sums three columns. */
export function logValue(names: string[], stats: unknown[], key: string): number | null {
  const cell = (k: string): number | null => {
    let i = names.indexOf(k);
    if (i < 0) i = names.findIndex((n) => n.split("-")[0] === k);
    if (i < 0) return null;
    const raw = stats[i];
    if (typeof raw === "string" && /^\d+-\d+$/.test(raw)) return Number(raw.split("-")[0]);
    return num(raw);
  };
  if (key === "pra") {
    const p = cell("points");
    const r = cell("totalRebounds") ?? cell("rebounds");
    const a = cell("assists");
    return p === null || r === null || a === null ? null : p + r + a;
  }
  return cell(key);
}

/** Player game log for one stat. Newest first. Preseason dropped. */
export function parseGameLog(data: unknown, key: string): PlayerGame[] {
  const d = asDict(data);
  const names = asList(d.names).map((x) => str(x) ?? "");
  const meta = asDict(d.events);
  const seen = new Set<string>();
  const rows: PlayerGame[] = [];
  for (const st of asList(d.seasonTypes).map(asDict)) {
    if (/preseason|spring/i.test(str(st.displayName) ?? "")) continue;
    for (const cat of asList(st.categories)) {
      for (const evRaw of asList(asDict(cat).events)) {
        const ev = asDict(evRaw);
        const eid = str(ev.eventId);
        if (!eid || seen.has(eid)) continue;
        const v = logValue(names, asList(ev.stats), key);
        if (v === null) continue;
        seen.add(eid);
        const m = asDict(meta[eid]);
        rows.push({ date: str(m.gameDate) ?? "", value: v, home: str(m.atVs) === "vs", opp: str(asDict(m.opponent).abbreviation) ?? "" });
      }
    }
  }
  rows.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  return rows;
}

