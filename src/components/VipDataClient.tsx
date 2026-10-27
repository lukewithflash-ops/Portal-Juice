"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { sideLine, splitTrend, type GapRow, type MlRates, type RateSet, type WLP, type Board, type DkLine, type DkSplitEvent, type MlEvent, type MlSnap, type Rec, type Split, type TeamGame } from "@/lib/teamDataCore";

type Head = {
  leagues: { id: string; label: string }[];
  league: string;
  seasons: { key: string; label: string }[];
  season: string | null;
  sources: { results: string; lines: string; splits: { label: string; url: string } };
  games: number;
  withLines: number;
  at: string | null;
  first: string | null;
  last: string | null;
  locked: boolean;
};
type TeamRow = { abbr: string; name: string; logo: string | null; su: string; ats: string; ou: string; n: number };
type TeamOut = { team: string; name: string; logo: string | null; all: Rec; last10: Rec; splits: Split[]; per: { n: number; h1: number; h2: number; last: number; lastWon: number }; per10: { n: number; last: number; h1: number; h2: number }; reasons: string[]; recent: TeamGame[] };
type Matchup = { id: string; start: string; state: string; away: Side; home: Side; line: DkLine | null; lineAt: string; splits: DkSplitEvent | null };
type Side = { abbr: string; name: string; logo: string | null; sum: TeamOut | null; restDays: number | null };

const pt = (iso: string | null, withTime = true) =>
  iso ? new Date(iso).toLocaleString("en-US", { timeZone: "America/Los_Angeles", month: "short", day: "numeric", ...(withTime ? { hour: "numeric", minute: "2-digit" } : {}) }) + (withTime ? " PT" : "") : "–";
const one = (x: number) => (x > 0 ? "+" : "") + (Math.round(x * 10) / 10).toFixed(1);
const ln = (x: number | null | undefined) => (x == null ? "–" : x > 0 ? `+${x}` : `${x}`);
const recS = (r: Rec) => `${r.w}-${r.l}${r.t ? `-${r.t}` : ""}`;
const atsS = (r: Rec) => `${r.ats[0]}-${r.ats[1]}${r.ats[2] ? `-${r.ats[2]}` : ""}`;
const ouS = (r: Rec) => `${r.ou[0]}-${r.ou[1]}${r.ou[2] ? `-${r.ou[2]}` : ""}`;
const atsPct = (r: Rec) => (r.ats[0] + r.ats[1] ? Math.round((100 * r.ats[0]) / (r.ats[0] + r.ats[1])) : null);

function Logo({ src, abbr, size = 28 }: { src: string | null; abbr: string; size?: number }) {
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="" width={size} height={size} className="shrink-0 object-contain drop-shadow-[0_0_6px_rgba(192,38,255,0.45)]" style={{ width: size, height: size }} />
  ) : (
    <span className="grid shrink-0 place-items-center rounded-full bg-white/10 text-[10px] font-black" style={{ width: size, height: size }}>{abbr}</span>
  );
}

function Pill({ on, children, onClick }: { on: boolean; children: React.ReactNode; onClick: () => void }) {
  return (
    <button onClick={onClick} className={"shrink-0 rounded-full px-3 py-1.5 text-[13px] font-bold transition " + (on ? "bg-gradient-to-r from-[color:var(--neon-purple)] to-[color:var(--neon-magenta)] text-white shadow-[0_0_14px_rgba(192,38,255,0.55)]" : "bg-white/[0.06] text-zinc-300")}>
      {children}
    </button>
  );
}

function SourceNote({ h }: { h: Head }) {
  return (
    <p className="px-1 text-[11px] leading-snug text-zinc-500" data-testid="vipdata-source">
      Results: {h.sources.results}. Lines: {h.sources.lines}. {h.games} finals tracked ({pt(h.first, false)} to {pt(h.last, false)}), {h.withLines} with a DraftKings close; games without one count straight-up only. Refreshed {pt(h.at)}. Past results only, not a pick.
    </p>
  );
}

function Locked({ h, extra }: { h: Head; extra?: string[] }) {
  return (
    <section className="relative overflow-hidden rounded-2xl border border-[color:var(--gold)]/40 bg-white/[0.03] p-4" data-testid="vipdata-locked">
      <div className="pointer-events-none select-none space-y-2 blur-[6px]" aria-hidden>
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="flex items-center gap-3 rounded-xl bg-white/[0.05] px-3 py-2">
            <span className="h-7 w-7 rounded-full bg-white/20" />
            <span className="h-3 flex-1 rounded bg-white/15" />
            <span className="h-3 w-14 rounded bg-[color:var(--plus)]/50" />
          </div>
        ))}
      </div>
      <div className="absolute inset-0 grid place-items-center bg-black/40 p-5 text-center">
        <div>
          <div className="text-3xl">🔒</div>
          <div className="mt-1 text-[17px] font-black text-white">VIP Data</div>
          <p className="mt-1 text-[13px] text-zinc-300">
            {h.games ? `${h.games} real finals, ${h.withLines} with DraftKings closing lines.` : "Records against the spread, moneylines, totals and trends."}
            {extra?.length ? ` ${extra.length} trend leaderboards, team splits, today’s matchups, line moves and money lean.` : ""}
          </p>
          <Link href="/vip" className="mt-3 inline-block rounded-full bg-[color:var(--gold)] px-4 py-2 text-[13px] font-black text-black">Unlock with VIP</Link>
        </div>
      </div>
    </section>
  );
}

function useData<T>(url: string | null) {
  const [d, setD] = useState<{ url: string; v: T } | null>(null);
  useEffect(() => {
    if (!url) return;
    let live = true;
    fetch(url, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => live && setD({ url, v: j }))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [url]);
  return d && d.url === url ? d.v : null;
}

export default function VipDataClient({ initialLeague = "nfl" }: { initialLeague?: string }) {
  const [lg, setLg] = useState(initialLeague);
  const [season, setSeason] = useState<string | null>(null);
  const [tab, setTab] = useState<"today" | "money" | "leaders" | "teams">("today");
  const qs = `lg=${lg}${season ? `&season=${season}` : ""}`;
  const d = useData<Head & { boards?: Board[]; teams?: TeamRow[] | number; boardTitles?: string[] }>(`/api/vipdata?${qs}`);
  const money = useData<Head & { splitsOn?: boolean; money?: MoneyV | null }>(d && !d.locked && tab === "money" ? `/api/vipdata?${qs}&view=money` : null);
  const today = useData<Head & { today?: { games: Matchup[]; splitsAt: string | null } }>(d && !d.locked && tab === "today" ? `/api/vipdata?${qs}&view=today` : null);
  return (
    <div className="mx-auto max-w-xl space-y-4" data-testid="vipdata">
      <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1">
        {(d?.leagues ?? [{ id: "nfl", label: "NFL" }, { id: "nba", label: "NBA" }, { id: "ncaaf", label: "NCAAF" }, { id: "nhl", label: "NHL" }, { id: "mlb", label: "MLB" }]).map((l) => (
          <Pill key={l.id} on={lg === l.id} onClick={() => { setLg(l.id); setSeason(null); }}>{l.label}</Pill>
        ))}
      </div>
      {!d ? (
        <div className="skel h-48 rounded-2xl" />
      ) : d.locked ? (
        <>
          <Locked h={d} extra={d.boardTitles} />
          <SourceNote h={d} />
        </>
      ) : (
        <>
          <div className="flex items-center gap-2">
            <div className="no-scrollbar flex min-w-0 gap-2 overflow-x-auto">
            {(["today", "money", "leaders", "teams"] as const).map((t) => (
              <Pill key={t} on={tab === t} onClick={() => setTab(t)}>{t === "today" ? "Today" : t === "money" ? "Public money" : t === "leaders" ? "Trend leaders" : "Teams"}</Pill>
            ))}
            </div>
            {d.seasons.length > 1 ? (
              <select value={d.season ?? ""} onChange={(e) => setSeason(e.target.value)} className="ml-auto rounded-full bg-white/[0.06] px-2 py-1.5 text-[12px] font-bold text-zinc-200" aria-label="Season">
                {d.seasons.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
              </select>
            ) : null}
          </div>
          {d.games === 0 ? <p className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-[13px] text-zinc-400">No finals stored for this season yet. The data job fills it in every 10 minutes.</p> : null}
          {tab === "money" ? <Money d={money} /> : null}
          {tab === "leaders" ? <Leaders boards={d.boards ?? []} lg={lg} season={d.season} /> : null}
          {tab === "teams" ? <Teams teams={Array.isArray(d.teams) ? d.teams : []} lg={lg} season={d.season} /> : null}
          {tab === "today" ? <Today d={today?.today ?? null} lg={lg} season={d.season} h={d} /> : null}
          <SourceNote h={d} />
        </>
      )}
    </div>
  );
}

function Leaders({ boards, lg, season }: { boards: Board[]; lg: string; season: string | null }) {
  if (!boards.length) return <p className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-[13px] text-zinc-400">Not enough games with lines yet for leaderboards.</p>;
  return (
    <div className="grid gap-3" data-testid="vipdata-boards">
      {boards.map((b) => (
        <section key={b.id} className="rounded-2xl border border-white/10 bg-gradient-to-b from-[color:var(--neon-violet)]/15 to-white/[0.02] p-3">
          <h3 className="mb-2 text-[12px] font-black uppercase tracking-[0.12em] text-[color:var(--neon-magenta)]">{b.title}</h3>
          <ol className="space-y-1">
            {b.rows.map((r, i) => (
              <li key={r.team}>
                <Link href={`/vip/data/${lg}/${r.team}${season ? `?season=${season}` : ""}`} className="flex items-center gap-2 rounded-lg px-1 py-1 active:bg-white/5">
                  <span className="w-4 text-right text-[12px] font-black text-zinc-500">{i + 1}</span>
                  <span className="w-12 text-[14px] font-black text-white">{r.team}</span>
                  <span className="flex-1 text-[14px] font-bold tabular text-[color:var(--plus)]">{r.value}</span>
                  <span className="text-[11px] text-zinc-500">{r.sample}</span>
                </Link>
              </li>
            ))}
          </ol>
        </section>
      ))}
    </div>
  );
}

function Teams({ teams, lg, season }: { teams: TeamRow[]; lg: string; season: string | null }) {
  const [q, setQ] = useState("");
  const list = teams.filter((t) => !q || (t.name + t.abbr).toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="space-y-2">
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a team" className="w-full rounded-full bg-white/[0.06] px-4 py-2 text-[14px] text-white placeholder:text-zinc-500" />
      <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-3 px-3 text-[10px] font-bold uppercase tracking-wider text-zinc-500"><span>Team</span><span>SU</span><span>ATS</span><span>O/U</span></div>
      <ul className="divide-y divide-white/5 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]">
        {list.map((t) => (
          <li key={t.abbr}>
            <Link href={`/vip/data/${lg}/${t.abbr}${season ? `?season=${season}` : ""}`} className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-x-3 px-3 py-2.5 text-[13px] tabular">
              <span className="flex min-w-0 items-center gap-2"><Logo src={t.logo} abbr={t.abbr} size={24} /><span className="truncate font-bold text-white">{t.name}</span></span>
              <span className="text-zinc-200">{t.su}</span>
              <span className="font-bold text-[color:var(--plus)]">{t.ats}</span>
              <span className="text-zinc-300">{t.ou}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

function restLabel(lg: string, d: number | null) {
  if (d == null) return null;
  if (lg === "nfl" || lg === "ncaaf") return d <= 5 ? "Short week" : d >= 10 ? "Off a bye" : "Normal week";
  return d <= 1 ? "Back-to-back" : d === 2 ? "1 day rest" : "2+ days rest";
}

function SplitLine({ s, label }: { s: TeamOut | null; label: string | null }) {
  if (!s || !label) return null;
  const r = s.splits.find((x) => x.label === label)?.r;
  if (!r) return <div className="text-[12px] text-zinc-500">{label}: no games yet</div>;
  return (
    <div className="flex justify-between text-[12px] tabular">
      <span className="text-zinc-400">{label}</span>
      <span className="text-zinc-200">{recS(r)} SU · <b className="text-[color:var(--plus)]">{atsS(r)}</b> ATS · {ouS(r)} O/U</span>
    </div>
  );
}

function SplitBars({ ev }: { ev: DkSplitEvent }) {
  return (
    <div className="space-y-2" data-testid="vipdata-splits">
      {ev.markets.map((m) => (
        <div key={m.name}>
          <div className="mb-1 flex text-[10px] font-bold uppercase tracking-wider text-zinc-500"><span className="flex-1">{m.name}</span><span className="w-20 text-right">% Bets</span><span className="w-20 text-right">% Money</span></div>
          {m.rows.map((r) => (
            <div key={r.side} className="flex items-center gap-2 py-0.5 text-[12px]">
              <span className="min-w-0 flex-1 truncate text-zinc-200">{r.side} <span className="text-zinc-500">{r.odds}</span></span>
              <Bar v={r.bets} tone="bg-[color:var(--neon-violet)]" />
              <Bar v={r.handle} tone="bg-[color:var(--plus)]" />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
function Bar({ v, tone }: { v: number; tone: string }) {
  return (
    <span className="flex w-20 items-center justify-end gap-1">
      <span className="h-1.5 w-10 overflow-hidden rounded-full bg-white/10"><span className={"block h-full rounded-full " + tone} style={{ width: `${v}%` }} /></span>
      <span className="w-8 text-right font-bold tabular text-white">{v}%</span>
    </span>
  );
}

function Today({ d, lg, season, h }: { d: { games: Matchup[]; splitsAt: string | null } | null; lg: string; season: string | null; h: Head }) {
  if (!d) return <div className="skel h-40 rounded-2xl" />;
  if (!d.games.length) return <p className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-[13px] text-zinc-400">No {lg.toUpperCase()} games on today’s slate. Check Trend leaders or Teams.</p>;
  return (
    <div className="space-y-3" data-testid="vipdata-today">
      {d.games.map((g) => {
        const L = g.line;
        const homeFav = L?.cur?.sp != null ? L.cur.sp < 0 : null;
        const moveSp = L?.osp != null && L?.cur?.sp != null && L.osp !== L.cur.sp;
        const moveTot = L?.otot != null && L?.cur?.tot != null && L.otot !== L.cur.tot;
        return (
          <section key={g.id} className="rounded-2xl border border-[color:var(--neon-purple)]/35 bg-gradient-to-b from-[color:var(--neon-purple)]/12 to-white/[0.02] p-3 shadow-[0_0_24px_rgba(192,38,255,0.12)]">
            <div className="flex items-center gap-2">
              <Logo src={g.away.logo} abbr={g.away.abbr} />
              <Link href={`/vip/data/${lg}/${g.away.abbr}${season ? `?season=${season}` : ""}`} className="font-black text-white">{g.away.abbr}</Link>
              <span className="text-zinc-500">@</span>
              <Link href={`/vip/data/${lg}/${g.home.abbr}${season ? `?season=${season}` : ""}`} className="font-black text-white">{g.home.abbr}</Link>
              <Logo src={g.home.logo} abbr={g.home.abbr} />
              <span className="ml-auto text-[11px] text-zinc-400">{g.state === "pre" ? pt(g.start) : g.state === "in" ? "Live" : "Final"}</span>
            </div>
            {L ? (
              <div className="mt-2 grid grid-cols-3 gap-2 text-center text-[11px]">
                <div className="rounded-lg bg-white/[0.05] p-1.5"><div className="text-zinc-500">Spread ({g.home.abbr})</div><div className="font-black text-white tabular">{ln(L.cur?.sp)}</div>{moveSp ? <div className="text-[color:var(--gold)]">opened {ln(L.osp)}</div> : <div className="text-zinc-600">no move</div>}</div>
                <div className="rounded-lg bg-white/[0.05] p-1.5"><div className="text-zinc-500">Total</div><div className="font-black text-white tabular">{L.cur?.tot ?? "–"}</div>{moveTot ? <div className="text-[color:var(--gold)]">opened {L.otot}</div> : <div className="text-zinc-600">no move</div>}</div>
                <div className="rounded-lg bg-white/[0.05] p-1.5"><div className="text-zinc-500">Moneyline</div><div className="font-black text-white tabular">{ln(L.cur?.mla)} / {ln(L.cur?.mlh)}</div><div className="text-zinc-600">{g.away.abbr} / {g.home.abbr}</div></div>
              </div>
            ) : <p className="mt-2 text-[11px] text-zinc-500">No DraftKings line posted yet.</p>}
            <div className="mt-3 space-y-2">
              {[{ s: g.away, venue: "Away", fav: homeFav == null ? null : homeFav ? "Underdog" : "Favorite" }, { s: g.home, venue: "Home", fav: homeFav == null ? null : homeFav ? "Favorite" : "Underdog" }].map(({ s, venue, fav }) => (
                <div key={s.abbr} className="rounded-xl bg-black/25 p-2">
                  <div className="mb-1 flex items-center justify-between"><span className="text-[13px] font-black text-white">{s.name}</span>{s.sum ? <span className="text-[11px] text-zinc-400 tabular">{recS(s.sum.all)} · {atsS(s.sum.all)} ATS · L10 {atsS(s.sum.last10)}</span> : <span className="text-[11px] text-zinc-500">no data yet</span>}</div>
                  <SplitLine s={s.sum} label={venue} />
                  <SplitLine s={s.sum} label={fav} />
                  <SplitLine s={s.sum} label={restLabel(lg, s.restDays)} />
                  {s.sum?.reasons[0] ? <p className="mt-1 text-[12px] text-[color:var(--neon-magenta)]">▸ {s.sum.reasons[0]}</p> : null}
                </div>
              ))}
            </div>
            {g.splits ? (
              <div className="mt-3 rounded-xl bg-black/25 p-2">
                <div className="mb-1 text-[11px] font-black uppercase tracking-wider text-zinc-400">Money lean · DraftKings public splits</div>
                <SplitBars ev={g.splits} />
              </div>
            ) : null}
          </section>
        );
      })}
      <p className="px-1 text-[11px] text-zinc-500">
        Lines: DraftKings via ESPN, checked {pt(d.games[0]?.lineAt ?? null)}. Money lean: <a href={h.sources.splits.url} target="_blank" rel="noreferrer" className="underline">{h.sources.splits.label}</a>{d.splitsAt ? `, pulled ${pt(d.splitsAt)}` : ", not available right now"}.
      </p>
    </div>
  );
}

export function VipTeamData({ lg, team, season }: { lg: string; team: string; season: string | null }) {
  const d = useData<Head & { team?: TeamOut | null; boardTitles?: string[] }>(`/api/vipdata?lg=${lg}&team=${team}${season ? `&season=${season}` : ""}`);
  if (!d) return <div className="skel h-60 rounded-2xl" />;
  if (d.locked) return <div className="mx-auto max-w-xl space-y-3"><Locked h={d} extra={d.boardTitles} /><SourceNote h={d} /></div>;
  const t = d.team;
  if (!t) return <p className="mx-auto max-w-xl rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-[13px] text-zinc-400">No stored games for {team.toUpperCase()} this season yet.</p>;
  const groups = [...new Set(t.splits.map((s) => s.group))];
  const p = atsPct(t.all);
  return (
    <div className="mx-auto max-w-xl space-y-4" data-testid="vipdata-team">
      <section className="flex items-center gap-3 rounded-2xl border border-[color:var(--neon-purple)]/40 bg-gradient-to-br from-[color:var(--neon-purple)]/25 to-transparent p-4">
        <Logo src={t.logo} abbr={t.team} size={56} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[18px] font-black text-white">{t.name}</div>
          <div className="text-[12px] text-zinc-400">{d.seasons.find((s) => s.key === d.season)?.label} · {t.all.n} games · {t.all.atsN} with DraftKings close</div>
        </div>
      </section>
      <div className="grid grid-cols-3 gap-2 text-center">
        {[["Straight up", recS(t.all), `${one(t.all.n ? t.all.margin / t.all.n : 0)} avg`], ["ATS", atsS(t.all), p == null ? "–" : `${p}% cover`], ["O/U", ouS(t.all), `${t.all.ouN} totals`]].map(([a, b, c]) => (
          <div key={a} className="rounded-2xl border border-white/10 bg-white/[0.04] p-2.5"><div className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">{a}</div><div className="big-num tabular text-2xl font-black text-[color:var(--flat)]">{b}</div><div className="text-[11px] text-zinc-400">{c}</div></div>
        ))}
      </div>
      {t.reasons.length ? (
        <section className="rounded-2xl border border-[color:var(--gold)]/30 bg-white/[0.03] p-3">
          <h3 className="mb-1 text-[12px] font-black uppercase tracking-[0.12em] text-[color:var(--gold)]">Why, by the numbers</h3>
          <ul className="space-y-1 text-[13px] text-zinc-200">{t.reasons.map((r) => <li key={r}>▸ {r}</li>)}</ul>
        </section>
      ) : null}
      <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
        <h3 className="mb-2 text-[12px] font-black uppercase tracking-[0.12em] text-zinc-400">Scoring by period</h3>
        <div className="grid grid-cols-3 gap-2 text-center text-[12px]">
          <div><div className="text-zinc-500">1st half</div><div className="font-black text-white tabular">{one(t.per.h1)}</div></div>
          <div><div className="text-zinc-500">2nd half</div><div className="font-black text-white tabular">{one(t.per.h2)}</div></div>
          <div><div className="text-zinc-500">{lg === "nhl" ? "3rd period" : lg === "mlb" ? "Inn. 7-9" : "4th qtr"}</div><div className="font-black text-white tabular">{one(t.per.last)}</div><div className="text-[10px] text-zinc-500">won {t.per.lastWon}/{t.per.n}</div></div>
        </div>
        <p className="mt-1 text-[11px] text-zinc-500">Average margin per game, {t.per.n} games with full linescores. Last {t.per10.n}: {one(t.per10.last)} in the final period.</p>
      </section>
      {groups.map((gname) => (
        <section key={gname} className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
          <h3 className="mb-1 text-[12px] font-black uppercase tracking-[0.12em] text-[color:var(--neon-magenta)]">{gname}</h3>
          <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-x-3 text-[12px] tabular">
            <span className="text-[10px] font-bold uppercase text-zinc-500">Split</span><span className="text-[10px] font-bold uppercase text-zinc-500">SU</span><span className="text-[10px] font-bold uppercase text-zinc-500">ATS</span><span className="text-[10px] font-bold uppercase text-zinc-500">O/U</span><span className="text-[10px] font-bold uppercase text-zinc-500">Margin</span>
            {t.splits.filter((s) => s.group === gname).map((s) => (
              <SplitRow key={s.key} s={s} />
            ))}
          </div>
        </section>
      ))}
      <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
        <h3 className="mb-1 text-[12px] font-black uppercase tracking-[0.12em] text-zinc-400">Last 10</h3>
        <ul className="divide-y divide-white/5 text-[12px] tabular">
          {t.recent.map((g) => {
            const m = g.pf - g.pa;
            const c = g.sp == null ? null : m + g.sp;
            const o = g.tot == null ? null : g.pf + g.pa - g.tot;
            return (
              <li key={g.id} className="flex items-center gap-2 py-1.5">
                <span className="w-14 text-zinc-500">{pt(g.d, false)}</span>
                <span className="w-16 text-white">{g.home ? "vs" : "@"} {g.opp}</span>
                <span className={"w-16 font-bold " + (m > 0 ? "text-[color:var(--plus)]" : m < 0 ? "text-[color:var(--minus)]" : "text-zinc-300")}>{m > 0 ? "W" : m < 0 ? "L" : "T"} {g.pf}-{g.pa}</span>
                <span className="flex-1 text-zinc-400">{g.sp == null ? "no line" : `${ln(g.sp)} ${c! > 0 ? "covered" : c! < 0 ? "missed" : "push"}`}</span>
                <span className="text-zinc-400">{g.tot == null ? "" : `${o! > 0 ? "O" : o! < 0 ? "U" : "P"} ${g.tot}`}</span>
              </li>
            );
          })}
        </ul>
      </section>
      <SourceNote h={d} />
    </div>
  );
}

function SplitRow({ s }: { s: Split }) {
  const p = atsPct(s.r);
  const hot = p != null && s.r.atsN >= 4 && p >= 65;
  const cold = p != null && s.r.atsN >= 4 && p <= 35;
  return (
    <>
      <span className="text-zinc-300">{s.label} <span className="text-zinc-600">({s.r.n})</span></span>
      <span className="text-zinc-200">{recS(s.r)}</span>
      <span className={"font-bold " + (hot ? "text-[color:var(--plus)]" : cold ? "text-[color:var(--minus)]" : "text-zinc-200")}>{atsS(s.r)}</span>
      <span className="text-zinc-300">{ouS(s.r)}</span>
      <span className="text-zinc-400">{one(s.r.n ? s.r.margin / s.r.n : 0)}</span>
    </>
  );
}

type MoneyV = { at: string | null; upcoming: { ev: MlEvent; lopsided: number; early?: boolean; gap: { market: string; side: string; gap: number } | null }[]; graded: MlEvent[]; tally: Record<string, { won: number; lost: number; push: number }>; gaps?: GapRow[]; rates?: MlRates; ratesAll?: MlRates; keptDays?: { full: number; summary: number } };

const SRC = "Source: DraftKings (via DraftKings Network)";
const LG_NAME: Record<string, string> = { nfl: "NFL", ncaaf: "College FB", nba: "NBA", nhl: "NHL", mlb: "MLB" };
const wlp = (x: WLP) => `${x.w}-${x.l}${x.p ? `-${x.p}` : ""}`;
const hit = (x: WLP) => (x.w + x.l ? `${Math.round((100 * x.w) / (x.w + x.l))}%` : "–");

export function GapBoard({ rows }: { rows: GapRow[] }) {
  const [all, setAll] = useState(false);
  const shown = all ? rows : rows.filter((r) => Math.abs(r.gap) >= 15);
  return (
    <section className="rounded-2xl border border-[color:var(--gold)]/40 bg-white/[0.03] p-3" data-testid="moneylean-gaps">
      <div className="flex items-center gap-2">
        <h3 className="flex-1 text-[12px] font-black uppercase tracking-[0.12em] text-[color:var(--gold)]">Money vs tickets gap</h3>
        <button type="button" onClick={() => setAll((v) => !v)} className="rounded-full bg-white/[0.08] px-2.5 py-1 text-[11px] font-bold text-zinc-200" data-testid="gap-toggle">
          {all ? "Only 15+ pts" : `Show all (${rows.length})`}
        </button>
      </div>
      <p className="mt-1 text-[11px] text-zinc-500">Gap = % of money minus % of bets on a side. Sorted by the biggest gap. {all ? "Showing every market." : "Hiding gaps under 15 pts."}</p>
      {shown.length ? (
        <div className="mt-2">
          <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-3 text-[10px] font-bold uppercase tracking-wider text-zinc-500"><span>Side</span><span className="text-right">Money</span><span className="text-right">Bets</span><span className="text-right">Gap</span></div>
          {shown.map((r) => (
            <div key={r.ev.id + r.market} className="border-t border-white/5 py-1.5 text-[12px]">
              <div className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-x-3 tabular">
                <span className="min-w-0 truncate"><span className="font-bold text-white">{r.side}</span> <span className="text-zinc-500">{r.market} · {r.ev.awayAbbr ?? r.ev.away} @ {r.ev.homeAbbr ?? r.ev.home}</span></span>
                <span className="text-right text-[color:var(--plus)]">{r.money}%</span>
                <span className="text-right text-[color:var(--neon-violet)]">{r.bets}%</span>
                <span className={"text-right font-black " + (Math.abs(r.gap) >= 15 ? "text-[color:var(--gold)]" : "text-zinc-300")}>{r.gap > 0 ? "+" : ""}{r.gap}</span>
              </div>
              {r.trend ? <div className="text-[10px] text-cyan-200">Trend: {r.trend.text}</div> : null}
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-2 text-[12px] text-zinc-400">No upcoming market has a gap of 15 pts or more right now.</p>
      )}
      <p className="mt-2 text-[10px] text-zinc-500">{SRC}</p>
    </section>
  );
}

function RateRow({ label, r }: { label: string; r: RateSet }) {
  return (
    <div className="grid grid-cols-[1fr_auto_auto] gap-x-4 border-t border-white/5 py-1.5 text-[12px] tabular">
      <span className="text-zinc-300">{label}</span>
      <span className="text-right"><b className="text-white">{hit(r.follow)}</b> <span className="text-zinc-500">{wlp(r.follow)}</span></span>
      <span className="text-right"><b className="text-white">{hit(r.fade)}</b> <span className="text-zinc-500">{wlp(r.fade)}</span></span>
    </div>
  );
}

export function Rates({ lg, r, all }: { lg: string; r?: MlRates; all?: MlRates }) {
  if (!r || !all) return null;
  const n = (x: RateSet) => x.follow.w + x.follow.l + x.follow.p;
  return (
    <section className="rounded-2xl border border-[color:var(--neon-purple)]/40 bg-white/[0.03] p-3" data-testid="moneylean-rates">
      <h3 className="text-[12px] font-black uppercase tracking-[0.12em] text-purple-200">Follow the money vs fade the tickets</h3>
      <p className="mt-1 text-[11px] text-zinc-500">Graded at the last snapshot before kickoff against the ESPN final. Follow the money = the side with more % of money. Fade the tickets = against the side with more % of bets. Hit % leaves out pushes.</p>
      {all.games ? (
        <>
          <div className="mt-2 grid grid-cols-[1fr_auto_auto] gap-x-4 text-[10px] font-bold uppercase tracking-wider text-zinc-500"><span>Sample</span><span className="text-right">Follow money</span><span className="text-right">Fade tickets</span></div>
          <RateRow label={`All leagues (${all.games} games)`} r={all.all} />
          {r.games ? <RateRow label={`${LG_NAME[lg] ?? lg} (${r.games} games)`} r={r.all} /> : null}
          {Object.entries(r.byMarket).map(([k, v]) => <RateRow key={k} label={`${LG_NAME[lg] ?? lg} ${k} (${n(v)})`} r={v} />)}
          {Object.entries(all.byLeague).filter(([k]) => k !== lg).map(([k, v]) => <RateRow key={k} label={`${LG_NAME[k] ?? k} (${n(v)} markets)`} r={v} />)}
          <p className="mt-2 text-[10px] text-zinc-500">Collecting since {all.since ? new Date(all.since).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/Los_Angeles" }) : "–"}. {all.games < 50 ? "Small sample, so treat these as early numbers." : ""} Ticket-side grading started Oct 27, 2026, so older games count toward Follow the money only.</p>
        </>
      ) : (
        <p className="mt-2 text-[12px] text-zinc-400">No graded games yet. Rates fill in as games finish.</p>
      )}
      <p className="mt-1 text-[10px] text-zinc-500">{SRC} · results from ESPN</p>
    </section>
  );
}

function Money({ d }: { d: (Head & { splitsOn?: boolean; money?: MoneyV | null }) | null }) {
  if (!d) return <div className="skel h-48 rounded-2xl" />;
  if (!d.splitsOn) return <p className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-[13px] text-zinc-400">Public money is switched off right now.</p>;
  const m = d.money;
  if (!m || (!m.upcoming.length && !m.graded.length)) return <p className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-[13px] text-zinc-400">No DraftKings splits saved for this league yet. Snapshots are taken about every 20 minutes before kickoff.</p>;
  return (
    <div className="space-y-3" data-testid="moneylean">
      <p className="px-1 text-[11px] font-bold text-zinc-300" data-testid="moneylean-source">{SRC}</p>
      {m.gaps ? <GapBoard rows={m.gaps} /> : null}
      <Rates lg={d.league} r={m.rates} all={m.ratesAll} />
      <p className="px-1 text-[12px] text-zinc-400">Games ranked by the most one-sided % of money on any market.</p>
      {m.upcoming.map((r, i) => <MoneyGame key={r.ev.id} r={r} rank={i + 1} />)}
      {m.graded.length ? (
        <section className="rounded-2xl border border-[color:var(--gold)]/30 bg-white/[0.03] p-3" data-testid="moneylean-graded">
          <h3 className="mb-1 text-[12px] font-black uppercase tracking-[0.12em] text-[color:var(--gold)]">Closing lean, graded</h3>
          <p className="mb-2 text-[11px] text-zinc-500">The side with more money in the last snapshot before kickoff, checked against the ESPN final.</p>
          <div className="mb-2 flex flex-wrap gap-2">
            {Object.entries(m.tally).map(([k, t]) => (
              <span key={k} className="rounded-full bg-white/[0.06] px-2.5 py-1 text-[11px] font-bold text-zinc-200">Money side, {k}: {t.won}-{t.lost}{t.push ? `-${t.push}` : ""}</span>
            ))}
          </div>
          <ul className="divide-y divide-white/5">
            {m.graded.map((e) => (
              <li key={e.id} className="py-2 text-[12px]">
                <div className="flex justify-between"><span className="font-bold text-white">{e.title}</span><span className="tabular text-zinc-400">Final {e.final!.as}-{e.final!.hs}</span></div>
                {e.graded!.map((g) => (
                  <div key={g.market} className="flex justify-between tabular">
                    <span className="text-zinc-400">{g.market}: {g.side} <span className="text-zinc-500">({g.money}% money, {g.bets}% bets)</span>{g.tSide ? <span className="block text-[11px] text-zinc-500">Tickets: {g.tSide} ({g.tBets}% bets) {g.tResult === "won" ? "covered, fade missed" : g.tResult === "lost" ? "missed, fade hit" : "push"}</span> : null}</span>
                    <span className={"font-black " + (g.result === "won" ? "text-[color:var(--plus)]" : g.result === "lost" ? "text-[color:var(--minus)]" : "text-zinc-300")}>{g.result === "won" ? (/total/i.test(g.market) ? "Hit" : /moneyline/i.test(g.market) ? "Won" : "Covered") : g.result === "lost" ? "Missed" : "Push"}</span>
                  </div>
                ))}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <p className="px-1 text-[11px] text-zinc-500">
        {SRC}: <a className="underline" href={d.sources.splits.url} target="_blank" rel="noreferrer">{d.sources.splits.label}</a> (lines and splits), results from ESPN. Last snapshot {pt(m.at)}. Every snapshot kept {m.keptDays?.full ?? 10} days; open, close and hourly splits kept {m.keptDays?.summary ?? 10} days for grading. Past and public data only, not a pick.
      </p>
    </div>
  );
}

function MoneyGame({ r, rank }: { r: MoneyV["upcoming"][number]; rank: number }) {
  const ev = r.ev;
  const last = ev.snaps[ev.snaps.length - 1];
  const first = ev.snaps[0];
  return (
    <section className="rounded-2xl border border-[color:var(--neon-purple)]/35 bg-gradient-to-b from-[color:var(--neon-purple)]/12 to-white/[0.02] p-3" data-testid="moneylean-game">
      <div className="flex items-center gap-2">
        <span className="grid h-6 w-6 place-items-center rounded-full bg-[color:var(--gold)] text-[11px] font-black text-black">{rank}</span>
        <span className="min-w-0 flex-1 truncate text-[14px] font-black text-white">{ev.title}</span>
        <span className="text-[11px] text-zinc-400">{pt(ev.start)}</span>
      </div>
      {r.early ? <div className="mt-2 text-[11px] text-zinc-400">Early market: DraftKings shows only one-sided action so far, so this game is listed below the ranked ones.</div> : null}
      {r.gap && Math.abs(r.gap.gap) >= 15 ? (
        <div className="mt-2 rounded-lg border border-[color:var(--gold)]/50 bg-[color:var(--gold)]/10 px-2 py-1 text-[12px] text-[color:var(--gold)]">
          Money vs tickets gap: {r.gap.side} ({r.gap.market}) has {r.gap.gap > 0 ? `${r.gap.gap} pts more money than tickets` : `${-r.gap.gap} pts more tickets than money`}.
        </div>
      ) : null}
      <div className="mt-2 space-y-3">
        {Object.entries(last.m).map(([market, rows]) => {
          const o = first.m[market]?.[0];
          const n = rows[0];
          const lnNow = market === "Moneyline" ? n.odds : sideLine(n.side);
          const lnThen = o ? (market === "Moneyline" ? o.odds : sideLine(o.side)) : null;
          return (
            <div key={market}>
              <div className="mb-1 flex text-[10px] font-bold uppercase tracking-wider text-zinc-500"><span className="flex-1">{market}</span><span className="w-20 text-right">% Bets</span><span className="w-20 text-right">% Money</span></div>
              {rows.map((x) => (
                <div key={x.side} className="flex items-center gap-2 py-0.5 text-[12px]">
                  <span className="min-w-0 flex-1 truncate text-zinc-200">{x.side} <span className="text-zinc-500">{x.odds}</span>{Math.abs(x.h - x.b) >= 15 ? <span className="ml-1 rounded bg-[color:var(--gold)]/20 px-1 text-[10px] font-bold text-[color:var(--gold)]">{x.h - x.b > 0 ? "+" : ""}{x.h - x.b}</span> : null}</span>
                  <Bar v={x.b} tone="bg-[color:var(--neon-violet)]" />
                  <Bar v={x.h} tone="bg-[color:var(--plus)]" />
                </div>
              ))}
              <Spark snaps={ev.snaps} market={market} start={ev.start} />
              <div className="text-[10px] text-zinc-500">
                {splitTrend(ev, market) ? <span className="block text-cyan-200">Trend: {splitTrend(ev, market)!.text}</span> : null}
                {n.side.replace(/\s*[+-]?\d+(\.\d+)?$/, "")}: {ev.snaps.length} snapshots{lnThen != null && String(lnThen) !== String(lnNow) ? `, line ${lnThen} → ${lnNow}` : ", line unchanged"}
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-2 text-[10px] text-zinc-500">{SRC}, updated {pt(last.t)}</div>
    </section>
  );
}

/** Money % (green) and bets % (violet) for the first side over time; dots where the line changed. */
function Spark({ snaps, market, start }: { snaps: MlSnap[]; market: string; start: string }) {
  const pts = snaps.filter((s) => s.m[market]?.[0] && s.t <= start);
  if (pts.length < 2) return <div className="mt-1 text-[10px] text-zinc-600">Timeline starts after the next snapshot.</div>;
  const W = 300, H = 36;
  const t0 = Date.parse(pts[0].t), t1 = Date.parse(pts[pts.length - 1].t) || t0 + 1;
  const x = (s: MlSnap) => ((Date.parse(s.t) - t0) / Math.max(1, t1 - t0)) * W;
  const y = (v: number) => H - (v / 100) * H;
  const line = (k: "h" | "b") => pts.map((s) => `${x(s).toFixed(1)},${y(s.m[market][0][k]).toFixed(1)}`).join(" ");
  const lineVal = (s: MlSnap) => (market === "Moneyline" ? s.m[market][0].odds : String(sideLine(s.m[market][0].side)));
  const moves = pts.filter((s, i) => i > 0 && lineVal(s) !== lineVal(pts[i - 1]));
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="mt-1 h-9 w-full" preserveAspectRatio="none" data-testid="moneylean-spark" aria-label={`${market} money and bets over time`}>
      <line x1="0" x2={W} y1={H / 2} y2={H / 2} stroke="rgba(255,255,255,0.12)" strokeDasharray="3 3" />
      <polyline points={line("b")} fill="none" stroke="var(--neon-violet)" strokeWidth="1.6" vectorEffect="non-scaling-stroke" />
      <polyline points={line("h")} fill="none" stroke="var(--plus)" strokeWidth="2" vectorEffect="non-scaling-stroke" style={{ filter: "drop-shadow(0 0 3px var(--plus))" }} />
      {moves.map((s) => <circle key={s.t} cx={x(s)} cy={y(s.m[market][0].h)} r="2.5" fill="var(--gold)" />)}
    </svg>
  );
}
