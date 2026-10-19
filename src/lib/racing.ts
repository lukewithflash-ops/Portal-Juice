/**
 * Auto racing from ESPN (F1, NASCAR Cup / O'Reilly / Trucks, IndyCar). Pure parsers and insights, no network.
 * Everything here is read from ESPN's racing feeds; when ESPN has nothing, the field stays null and the UI says so.
 */
import type { Pick as LoggedPick, PickStatus } from "@/lib/types";

export type RaceState = "pre" | "in" | "post";

export const RACING = [
  { id: "racing.f1", label: "F1", name: "Formula 1", slug: "f1" },
  { id: "racing.nascar-premier", label: "NASCAR", name: "NASCAR Cup Series", slug: "nascar-premier" },
  { id: "racing.irl", label: "IndyCar", name: "IndyCar", slug: "irl" },
  { id: "racing.nascar-secondary", label: "O'Reilly", name: "NASCAR O'Reilly Auto Parts Series", slug: "nascar-secondary" },
  { id: "racing.nascar-truck", label: "Trucks", name: "NASCAR Truck Series", slug: "nascar-truck" },
] as const;
export type RacingId = (typeof RACING)[number]["id"];
export const isRacing = (id: string | null | undefined): id is RacingId => !!id && RACING.some((r) => r.id === id);
export const racingLeague = (id: string) => RACING.find((r) => r.id === id) ?? null;
export const raceHref = (league: string, eventId: string) => `/racing/${league}/${eventId}`;

type Dict = Record<string, unknown>;
const asDict = (v: unknown): Dict => (v && typeof v === "object" ? (v as Dict) : {});
const asList = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
const num = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};
const https = (v: unknown) => (str(v) ? str(v)!.replace(/^http:/, "https:") : null);

export type Finisher = { id: string; name: string; short: string; flag: string | null; pos: number; winner: boolean };
export type RaceSession = { id: string; type: string; label: string; date: string; state: RaceState; detail: string; finishers: Finisher[] };
export type RaceEvent = {
  id: string;
  league: string;
  name: string;
  short: string;
  date: string;
  endDate: string | null;
  state: RaceState;
  detail: string;
  circuit: string | null;
  city: string | null;
  /** Same track across seasons: F1 circuit id, else the race name without sponsor/series. */
  track: string;
  sessions: RaceSession[];
  /** False for exhibition races (Clash, Duels, All-Star) that don't count toward form. */
  points: boolean;
};

const SESSION_LABEL: Record<string, string> = { FP1: "Practice 1", FP2: "Practice 2", FP3: "Practice 3", Qual: "Qualifying", SS: "Sprint Qualifying", SR: "Sprint", Race: "Race" };

function stateOf(status: unknown): { state: RaceState; detail: string } {
  const t = asDict(asDict(status).type);
  const s = str(t.state);
  return { state: s === "in" ? "in" : s === "post" ? "post" : "pre", detail: str(t.shortDetail) || str(t.detail) || "" };
}

function finishers(comp: Dict): Finisher[] {
  return asList(comp.competitors)
    .map(asDict)
    .map((c) => {
      const a = asDict(c.athlete);
      const name = str(a.displayName) || str(a.fullName) || "";
      return { id: String(c.id ?? ""), name, short: str(a.shortName) || name, flag: https(asDict(a.flag).href), pos: num(c.order) ?? 999, winner: c.winner === true };
    })
    .filter((f) => f.id && f.name)
    .sort((a, b) => a.pos - b.pos);
}

/** "NASCAR Cup Series at Talladega" → "talladega"; "Grand Prix of Monterey" → "grand prix of monterey". */
export function trackKey(league: string, name: string, circuitId: string | null): string {
  if (league === "racing.f1" && circuitId) return `c${circuitId}`;
  const at = name.match(/\bat\s+(.+)$/i);
  const base = at ? at[1] : name;
  return base.toLowerCase().replace(/\b(19|20)\d\d\b/g, "").replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
}

const EXHIBITION = /\b(clash|duel|all-star|all star|open)\b/i;

/** One ESPN racing scoreboard (a single day, or `?dates=YYYY` for the whole season) → events, oldest first. */
export function parseRaceSeason(league: string, data: unknown): RaceEvent[] {
  const out: RaceEvent[] = [];
  for (const ev of asList(asDict(data).events).map(asDict)) {
    const id = str(ev.id) ?? String(ev.id ?? "");
    const name = str(ev.name) ?? "";
    if (!id || !name) continue;
    const circuit = asDict(ev.circuit);
    const comps = asList(ev.competitions).map(asDict);
    const sessions: RaceSession[] = comps.map((c) => {
      const type = str(asDict(c.type).abbreviation) ?? "Race";
      const st = stateOf(c.status);
      return { id: String(c.id ?? id), type, label: SESSION_LABEL[type] ?? type, date: str(c.date) ?? str(ev.date) ?? "", state: st.state, detail: st.detail, finishers: finishers(c) };
    });
    const race = sessions.find((s) => s.type === "Race") ?? sessions[sessions.length - 1];
    const live = sessions.find((s) => s.state === "in");
    const st = stateOf(ev.status);
    const state: RaceState = live ? "in" : race?.state === "post" ? "post" : st.state === "in" ? "in" : race?.state ?? st.state;
    out.push({
      id,
      league,
      name,
      short: str(ev.shortName) ?? name,
      date: race?.date || str(ev.date) || "",
      endDate: str(ev.endDate),
      state,
      detail: live ? `${live.label} · ${live.detail}` : race?.detail || st.detail,
      circuit: str(circuit.fullName),
      city: str(asDict(circuit.address).city),
      track: trackKey(league, name, str(circuit.id)),
      sessions,
      points: !EXHIBITION.test(name),
    });
  }
  return out.sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
}

export const raceSession = (ev: RaceEvent): RaceSession | null => ev.sessions.find((s) => s.type === "Race") ?? ev.sessions[ev.sessions.length - 1] ?? null;
/** The session to watch: the live one, else the race once it has a result, else the latest with a result, else the race. */
export function focusSession(ev: RaceEvent): RaceSession | null {
  const live = ev.sessions.find((s) => s.state === "in");
  if (live) return live;
  const race = raceSession(ev);
  if (race && race.finishers.length) return race;
  const done = [...ev.sessions].reverse().find((s) => s.finishers.length);
  return done ?? race;
}

/** Next race not finished, else the latest. */
export function nextRace(events: RaceEvent[], now = Date.now()): RaceEvent | null {
  const live = events.find((e) => e.state === "in");
  if (live) return live;
  return events.find((e) => e.state === "pre" && Date.parse(e.endDate ?? e.date) > now - 6 * 3600e3) ?? events[events.length - 1] ?? null;
}

// ── Season form ────────────────────────────────────────────────────────────────

export type DriverForm = {
  starts: number;
  avg: number | null;
  wins: number;
  top3: number;
  top5: number;
  top10: number;
  /** Most recent first: up to 5. */
  last: { event: string; pos: number }[];
  /** Last 3 average vs season average: "up" = finishing better lately. */
  trend: "up" | "down" | "flat" | null;
  best: number | null;
};

const avgOf = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null);

/** Race finishes for one driver from completed points races, optionally only races before `beforeIso`. */
export function driverForm(events: RaceEvent[], driverId: string, beforeIso?: string | null): DriverForm {
  const res: { event: string; pos: number }[] = [];
  for (const ev of events) {
    if (!ev.points || ev.state !== "post") continue;
    if (beforeIso && Date.parse(ev.date) >= Date.parse(beforeIso)) continue;
    const r = raceSession(ev);
    const f = r?.finishers.find((x) => x.id === driverId);
    if (f && f.pos < 999) res.push({ event: ev.short || ev.name, pos: f.pos });
  }
  const pos = res.map((r) => r.pos);
  const avg = avgOf(pos);
  const last3 = avgOf(pos.slice(-3));
  const trend = pos.length >= 5 && avg !== null && last3 !== null ? (last3 <= avg - 2 ? "up" : last3 >= avg + 2 ? "down" : "flat") : null;
  return {
    starts: pos.length,
    avg,
    wins: pos.filter((p) => p === 1).length,
    top3: pos.filter((p) => p <= 3).length,
    top5: pos.filter((p) => p <= 5).length,
    top10: pos.filter((p) => p <= 10).length,
    last: res.slice(-5).reverse(),
    trend,
    best: pos.length ? Math.min(...pos) : null,
  };
}

export type TrackRun = { year: string; pos: number };
/** This driver's race finishes at the same track in earlier events (any season given). Most recent first. */
export function trackHistory(events: RaceEvent[], track: string, driverId: string, beforeIso: string): TrackRun[] {
  const out: TrackRun[] = [];
  for (const ev of events) {
    if (ev.track !== track || ev.state !== "post" || Date.parse(ev.date) >= Date.parse(beforeIso)) continue;
    const f = raceSession(ev)?.finishers.find((x) => x.id === driverId);
    if (f && f.pos < 999) out.push({ year: ev.date.slice(0, 4), pos: f.pos });
  }
  return out.reverse();
}

/** Head to head this season: races where both finished, and how often `a` beat `b`. */
export function headToHead(events: RaceEvent[], a: string, b: string, beforeIso?: string | null): { races: number; aAhead: number } {
  let races = 0;
  let aAhead = 0;
  for (const ev of events) {
    if (!ev.points || ev.state !== "post") continue;
    if (beforeIso && Date.parse(ev.date) >= Date.parse(beforeIso)) continue;
    const fs = raceSession(ev)?.finishers ?? [];
    const fa = fs.find((x) => x.id === a);
    const fb = fs.find((x) => x.id === b);
    if (!fa || !fb) continue;
    races++;
    if (fa.pos < fb.pos) aAhead++;
  }
  return { races, aAhead };
}

// ── Running order (ESPN core competitors + statistics) ─────────────────────────

export type RunRow = {
  id: string;
  name: string;
  short: string;
  flag: string | null;
  number: string | null;
  team: string | null;
  color: string | null;
  pos: number;
  start: number | null;
  laps: number | null;
  behindLaps: number | null;
  behindTime: number | null;
  totalTime: string | null;
  pits: number | null;
  lapsLed: number | null;
  fastestLap: number | null;
  /** ESPN's own text for the fastest lap, e.g. "1:35.202". */
  fastestLapText: string | null;
  fastestLapNum: number | null;
};

/** "+7.335", "1:02.5", "12.345" → seconds. */
export function secondsOf(text: string | null | undefined): number | null {
  const t = (text ?? "").replace(/^\+/, "").trim();
  if (!t) return null;
  const parts = t.split(":").map(Number);
  if (parts.some((x) => !Number.isFinite(x))) return null;
  const secs = parts.reduce((a, b) => a * 60 + b, 0);
  return secs > 0 ? secs : null;
}

/** One core competitor (inline on the competition) plus its statistics document. */
export function parseRunRow(compRaw: unknown, statsRaw: unknown, names: Map<string, Finisher>): RunRow | null {
  const c = asDict(compRaw);
  const id = String(c.id ?? "");
  if (!id) return null;
  const v = asDict(c.vehicle);
  const stats: Record<string, { v: number | null; d: string | null }> = {};
  for (const cat of asList(asDict(asDict(statsRaw).splits).categories).map(asDict))
    for (const s of asList(cat.stats).map(asDict)) {
      const n = str(s.name);
      if (n) stats[n] = { v: num(s.value), d: str(s.displayValue) };
    }
  const pos0 = (k: string) => {
    const x = stats[k]?.v;
    return x !== null && x !== undefined && x > 0 ? x : null;
  };
  const who = names.get(id);
  const name = who?.name ?? "";
  if (!name) return null;
  const lapsC = stats.lapsCompleted?.v ?? null;
  return {
    id,
    name,
    short: who?.short ?? name,
    flag: who?.flag ?? null,
    number: str(v.number),
    team: str(v.team) ?? str(v.manufacturer),
    color: str(v.teamColor) ? `#${str(v.teamColor)}` : null,
    pos: num(c.order) ?? stats.place?.v ?? 999,
    start: num(c.startOrder),
    laps: lapsC,
    behindLaps: stats.behindLaps?.v ?? null,
    behindTime: secondsOf(stats.behindTime?.d),
    totalTime: stats.totalTime?.d && stats.totalTime.d !== ".000" ? stats.totalTime.d : null,
    pits: stats.pitsTaken?.v ?? null,
    lapsLed: stats.lapsLead?.v ?? null,
    fastestLap: pos0("fastestLap"),
    fastestLapText: pos0("fastestLap") && stats.fastestLap?.d && stats.fastestLap.d !== ".000" ? stats.fastestLap.d : null,
    fastestLapNum: pos0("fastestLapNum"),
  };
}

/** Gap to the leader as ESPN gives it: laps down, else seconds. Null when ESPN posts neither. */
export function gapText(r: RunRow): string | null {
  if (r.pos === 1) return r.totalTime ?? "Leader";
  if (r.behindLaps && r.behindLaps > 0) return `+${r.behindLaps} lap${r.behindLaps === 1 ? "" : "s"}`;
  if (r.behindTime && r.behindTime > 0) return `+${r.behindTime.toFixed(3)}`;
  return null;
}

/** Interval to the car ahead, only when both cars have a seconds gap on the same lap. */
export function intervalText(rows: RunRow[], i: number): string | null {
  const r = rows[i];
  const a = rows[i - 1];
  if (!r || !a || r.behindLaps || a.behindLaps) return null;
  const rt = r.behindTime ?? null;
  const at = a.pos === 1 ? 0 : a.behindTime ?? null;
  if (rt === null || at === null || rt < at) return null;
  return `+${(rt - at).toFixed(3)}`;
}

export const fastestId = (rows: RunRow[]): string | null => {
  const withLap = rows.filter((r) => r.fastestLap && r.fastestLap > 0);
  if (!withLap.length) return null;
  return withLap.reduce((a, b) => ((b.fastestLap as number) < (a.fastestLap as number) ? b : a)).id;
};

// ── Insights: plain reads from the numbers above, no prices ────────────────────

export type RaceRead = { driverId: string; name: string; kind: "form" | "track" | "grid" | "trend" | "teammate" | "wins"; text: string };

export function raceReads(input: {
  field: { id: string; name: string; team: string | null; start: number | null }[];
  form: Record<string, DriverForm>;
  track: Record<string, TrackRun[]>;
  h2h?: Record<string, { mate: string; races: number; ahead: number }>;
}): RaceRead[] {
  const out: RaceRead[] = [];
  const { field, form, track } = input;
  const ranked = field.filter((d) => (form[d.id]?.last.length ?? 0) >= 3);
  const last5 = (id: string) => avgOf((form[id]?.last ?? []).map((l) => l.pos)) ?? 99;
  const hot = [...ranked].sort((a, b) => last5(a.id) - last5(b.id)).slice(0, 3);
  for (const d of hot) out.push({ driverId: d.id, name: d.name, kind: "form", text: `Last ${form[d.id].last.length} finishes ${form[d.id].last.map((l) => "P" + l.pos).join(", ")} (avg ${last5(d.id)})` });
  const winners = field.filter((d) => (form[d.id]?.wins ?? 0) >= 2).sort((a, b) => form[b.id].wins - form[a.id].wins).slice(0, 2);
  for (const d of winners) out.push({ driverId: d.id, name: d.name, kind: "wins", text: `${form[d.id].wins} wins, ${form[d.id].top5} top-5s in ${form[d.id].starts} starts this season` });
  const specialists = field
    .filter((d) => (track[d.id]?.length ?? 0) >= 2)
    .map((d) => ({ d, avg: avgOf(track[d.id].map((t) => t.pos)) as number }))
    .sort((a, b) => a.avg - b.avg)
    .slice(0, 2);
  for (const { d, avg } of specialists) out.push({ driverId: d.id, name: d.name, kind: "track", text: `Here before: ${track[d.id].map((t) => `P${t.pos} (${t.year})`).join(", ")}, avg ${avg}` });
  for (const d of field.filter((x) => x.start !== null && x.start <= 3).sort((a, b) => (a.start as number) - (b.start as number)))
    out.push({ driverId: d.id, name: d.name, kind: "grid", text: `Starts P${d.start}` });
  for (const d of field.filter((x) => form[x.id]?.trend === "up").slice(0, 3)) {
    const f = form[d.id];
    out.push({ driverId: d.id, name: d.name, kind: "trend", text: `Trending up: last 3 avg ${avgOf(f.last.slice(0, 3).map((l) => l.pos))} vs season ${f.avg}` });
  }
  for (const [id, h] of Object.entries(input.h2h ?? {})) {
    const d = field.find((x) => x.id === id);
    if (!d || h.races < 4 || h.ahead / h.races < 0.7) continue;
    out.push({ driverId: id, name: d.name, kind: "teammate", text: `Ahead of teammate ${h.mate} in ${h.ahead} of ${h.races} races` });
  }
  return out;
}

// ── Picks: winner, top N, head to head; graded from ESPN's final order ─────────

export const RACE_MARKETS = ["Race Winner", "Top 3", "Top 5", "Top 10"] as const;
export const h2hMarket = (rival: string) => `H2H vs ${rival}`;

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z ]/g, " ").replace(/\s+/g, " ").trim();
function findDriver(fs: Finisher[], name: string): Finisher | null {
  const n = norm(name);
  if (!n) return null;
  const exact = fs.find((f) => norm(f.name) === n);
  if (exact) return exact;
  const last = n.split(" ").slice(-1)[0];
  const byLast = fs.filter((f) => norm(f.name).split(" ").slice(-1)[0] === last);
  return byLast.length === 1 ? byLast[0] : null;
}

/** Grade a racing pick once ESPN marks the race final. Null = not final or can't tell. A driver missing from the result is a push (didn't start). */
export function gradeRacePick(pick: LoggedPick, race: RaceSession | null): PickStatus | null {
  if (!race || race.state !== "post" || !race.finishers.length || pick.status !== "open") return null;
  const m = (pick.market ?? "").trim();
  const me = findDriver(race.finishers, pick.subject);
  const vs = m.match(/^H2H vs (.+)$/i);
  if (vs) {
    const them = findDriver(race.finishers, vs[1]);
    if (!me || !them) return "push";
    return me.pos < them.pos ? "win" : "loss";
  }
  if (!me) return "push";
  if (/^race winner$/i.test(m)) return me.pos === 1 ? "win" : "loss";
  const top = m.match(/^top (\d+)$/i);
  if (top) return me.pos <= Number(top[1]) ? "win" : "loss";
  return null;
}
