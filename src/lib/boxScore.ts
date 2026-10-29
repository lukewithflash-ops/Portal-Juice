/** ESPN box score → Portal tables. Pure parser: every number shown is ESPN's (team PTS in hockey is G+A). */
export type BoxRow = { id: string; name: string; short: string; jersey: string; pos: string; stats: string[]; note?: string };
export type BoxGroup = { title: string; labels: string[]; rows: BoxRow[]; totals: string[] | null };
export type BoxTeam = { id: string; abbr: string; name: string; color: string; groups: BoxGroup[] };
export type BoxScore = { state: "pre" | "in" | "post"; teams: BoxTeam[]; teamStats: { label: string; away: string; home: string }[] };

type Any = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const s = (v: unknown) => (v == null ? "" : String(v));

/** Pick columns in a preferred order; any that ESPN doesn't send are dropped, never filled. */
function pick(labels: string[], want: string[] | null, rows: string[][], totals: string[] | null, add?: Record<string, (r: Map<string, string>) => string>) {
  if (!want) return { labels, rows, totals };
  const idx = new Map(labels.map((l, i) => [l, i]));
  const cols = want.filter((w) => idx.has(w) || add?.[w]);
  const map = (r: string[]) => {
    const m = new Map(labels.map((l, i) => [l, r[i] ?? ""]));
    return cols.map((c) => (idx.has(c) ? r[idx.get(c)!] ?? "" : add![c](m)));
  };
  return { labels: cols, rows: rows.map(map), totals: totals && totals.length ? map(totals) : null };
}

const RENAME: Record<string, string> = { "Yellow Cards": "Yellows", "Red Cards": "Reds", "Edge": "Advantage" };
const clean = (t: string) => RENAME[t] ?? t.replace(/\bcards?\b/gi, "").replace(/\bedge\b/gi, "").replace(/\s+/g, " ").trim();

/** Team color, unless it's too dark to read on the neon night background. */
function bright(hex: unknown): string | null {
  const h = typeof hex === "string" ? hex.replace("#", "") : "";
  if (!/^[0-9a-f]{6}$/i.test(h)) return null;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 70 ? null : "#" + h;
}

function sportOf(path: string): string {
  return path.split("/")[0];
}

function wantFor(sport: string, group: string, type: string): string[] | null {
  const g = (group || type || "").toLowerCase();
  if (sport === "basketball") return ["MIN", "PTS", "REB", "AST", "STL", "BLK", "TO", "FG", "3PT", "FT", "OREB", "DREB", "PF", "+/-"];
  if (sport === "baseball") {
    if (g === "batting") return ["AB", "R", "H", "RBI", "HR", "BB", "K", "AVG", "OBP", "SLG"];
    if (g === "pitching") return ["IP", "H", "R", "ER", "BB", "K", "HR", "PC-ST", "ERA"];
  }
  if (sport === "hockey") {
    if (g === "goalies") return ["SA", "GA", "SV", "SV%", "TOI", "PIM"];
    return ["G", "A", "PTS", "SOG", "+/-", "TOI", "HT", "BS", "PIM", "FW", "FL", "FO%"];
  }
  return null;
}

const TITLES: Record<string, string> = {
  passing: "Passing", rushing: "Rushing", receiving: "Receiving", fumbles: "Fumbles", defensive: "Defense", interceptions: "Interceptions",
  kickReturns: "Kick returns", puntReturns: "Punt returns", kicking: "Kicking", punting: "Punting",
  batting: "Batting", pitching: "Pitching", forwards: "Forwards", defenses: "Defense", goalies: "Goalies", skaters: "Skaters",
};

function athleteRow(a: Any, stats: string[]): BoxRow {
  const at = a.athlete ?? {};
  const note = a.didNotPlay ? s(a.reason) || "DNP" : a.ejected ? "Ejected" : undefined;
  return { id: s(at.id), name: s(at.displayName), short: s(at.shortName || at.displayName), jersey: s(at.jersey ?? a.jersey), pos: s(at.position?.abbreviation ?? a.position?.abbreviation), stats, note };
}

export function parseBoxScore(data: unknown, path: string): BoxScore | null {
  const d = (data ?? {}) as Any;
  const comp = d.header?.competitions?.[0] ?? {};
  const st = s(comp.status?.type?.state);
  const state = (st === "in" || st === "post" ? st : "pre") as BoxScore["state"];
  const sides: Any[] = comp.competitors ?? [];
  const sideOf = (id: string) => s(sides.find((c) => s(c.id ?? c.team?.id) === id)?.homeAway);
  const sport = sportOf(path);
  const teams: BoxTeam[] = [];
  const teamInfo = (t: Any) => ({ id: s(t.id), abbr: s(t.abbreviation || t.shortDisplayName), name: s(t.displayName), color: bright(t.color) ?? bright(t.alternateColor) ?? "#a855f7" });

  for (const p of (d.boxscore?.players ?? []) as Any[]) {
    const groups: BoxGroup[] = [];
    for (const g of (p.statistics ?? []) as Any[]) {
      const ath: Any[] = g.athletes ?? [];
      if (!ath.length) continue;
      const labels: string[] = (g.labels ?? g.names ?? []).map(s);
      const want = wantFor(sport, s(g.name), s(g.type));
      const add = sport === "hockey" ? { PTS: (m: Map<string, string>) => (m.has("G") && m.has("A") && m.get("G") !== "" && m.get("A") !== "" ? String(Number(m.get("G")) + Number(m.get("A"))) : "") } : undefined;
      const playedRows = ath.map((a) => (a.stats ?? []).map(s));
      const picked = pick(labels, want, playedRows, g.totals ? (g.totals as unknown[]).map(s) : null, add);
      const rows = ath.map((a, i) => athleteRow(a, a.didNotPlay ? [] : picked.rows[i]));
      const title = TITLES[s(g.name)] ?? TITLES[s(g.type)] ?? clean(s(g.text || g.name || g.type)) ?? "";
      if (sport === "basketball" && ath.some((a) => a.starter)) {
        groups.push({ title: "Starters", labels: picked.labels, rows: rows.filter((_, i) => ath[i].starter), totals: null });
        groups.push({ title: "Bench", labels: picked.labels, rows: rows.filter((_, i) => !ath[i].starter), totals: picked.totals });
      } else groups.push({ title, labels: picked.labels, rows, totals: picked.totals });
    }
    if (groups.length) teams.push({ ...teamInfo(p.team ?? {}), groups });
  }

  // Soccer: ESPN gives per-player numbers in rosters, not boxscore.players.
  if (!teams.length && sport === "soccer") {
    const want = ["G", "A", "SHOT", "SOG", "FC", "FA", "YC", "RC", "SV"];
    const nice: Record<string, string> = { SHOT: "SH", FC: "FC", FA: "FS", YC: "YC", RC: "RC" };
    for (const r of (d.rosters ?? []) as Any[]) {
      const list: Any[] = r.roster ?? [];
      if (!list.length) continue;
      const mk = (a: Any): BoxRow => {
        const m = new Map<string, string>(((a.stats ?? []) as Any[]).map((x) => [s(x.abbreviation), s(x.displayValue)]));
        const row = athleteRow(a, want.map((w) => m.get(w) ?? ""));
        if (a.subbedIn) row.note = row.note ?? "Sub in";
        if (a.subbedOut && a.starter) row.note = "Subbed off";
        if (!a.starter && !a.subbedIn) {
          row.stats = [];
          row.note = "Unused sub";
        }
        return row;
      };
      const labels = want.map((w) => nice[w] ?? w);
      const starters = list.filter((a) => a.starter).map(mk);
      const bench = list.filter((a) => !a.starter).map(mk);
      const groups: BoxGroup[] = [];
      if (starters.length) groups.push({ title: s(r.formation) ? `Starting XI · ${s(r.formation)}` : "Starting XI", labels, rows: starters, totals: null });
      if (bench.length) groups.push({ title: "Bench", labels, rows: bench, totals: null });
      if (groups.length && starters.some((x) => x.stats.length)) teams.push({ ...teamInfo(r.team ?? {}), groups });
    }
  }

  // Away first, the way ESPN reads.
  teams.sort((a, b) => (sideOf(a.id) === "away" ? -1 : sideOf(b.id) === "away" ? 1 : 0));

  const tt: Any[] = d.boxscore?.teams ?? [];
  const away = tt.find((t) => sideOf(s(t.team?.id)) === "away") ?? tt[0];
  const home = tt.find((t) => sideOf(s(t.team?.id)) === "home") ?? tt[1];
  const teamStats: BoxScore["teamStats"] = [];
  if (away && home && away !== home) {
    for (const a of (away.statistics ?? []) as Any[]) {
      const h = ((home.statistics ?? []) as Any[]).find((x) => x.name === a.name);
      if (!h || a.displayValue == null || a.displayValue === "") continue;
      teamStats.push({ label: clean(s(a.label || a.name)), away: s(a.displayValue), home: s(h.displayValue) });
    }
  }
  if (!teams.length && !teamStats.length) return { state, teams: [], teamStats: [] };
  return { state, teams, teamStats };
}
