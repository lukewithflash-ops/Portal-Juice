"use client";

import { useState } from "react";
import { STAT_CHOICES, type GameRef, type ImportLeg, type SlipKind, type SlipRow } from "@/lib/slipImport";
import { pickFromLeg } from "@/lib/legPick";
import { addPick } from "@/lib/pickStore";

const SPORTS: { id: string; label: string; group: string; league: string | null }[] = [
  { id: "any", label: "Any sport", group: "basketball", league: null },
  { id: "nfl", label: "NFL", group: "football", league: "nfl" },
  { id: "ncaaf", label: "College football", group: "football", league: "ncaaf" },
  { id: "nba", label: "NBA", group: "basketball", league: "nba" },
  { id: "wnba", label: "WNBA", group: "basketball", league: "wnba" },
  { id: "ncaam", label: "College hoops (M)", group: "basketball", league: "ncaam" },
  { id: "ncaaw", label: "College hoops (W)", group: "basketball", league: "ncaaw" },
  { id: "mlb", label: "MLB", group: "baseball", league: "mlb" },
  { id: "nhl", label: "NHL", group: "hockey", league: "nhl" },
  { id: "atp", label: "Tennis · ATP", group: "tennis", league: "atp" },
  { id: "wta", label: "Tennis · WTA", group: "tennis", league: "wta" },
  { id: "soccer", label: "Soccer", group: "soccer", league: null },
];
const TEAM_MARKETS = ["moneyline", "spread", "total"];

function localDay(iso: string | undefined): string {
  const d = iso ? new Date(iso) : new Date();
  const t = Number.isNaN(d.getTime()) ? new Date() : d;
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
}
const when = (g: GameRef) => (g.state === "in" ? "Live" : g.state === "post" ? "Final" : new Date(g.start).toLocaleString([], { weekday: "short", hour: "numeric", minute: "2-digit" }));

/**
 * Log a pick by finding its game: type a player or team, pick the stat, and it ties to the real ESPN game
 * (live tennis included), so My Live and the Log can meter it. Log-only.
 */
export default function QuickPick({ onDone }: { onDone?: () => void }) {
  const [sport, setSport] = useState("any");
  const [who, setWho] = useState("");
  const [market, setMarket] = useState("points");
  const [line, setLine] = useState("");
  const [side, setSide] = useState<"Over" | "Under">("Over");
  const [busy, setBusy] = useState(false);
  const [found, setFound] = useState<ImportLeg | null>(null);
  const [msg, setMsg] = useState("");
  const s = SPORTS.find((x) => x.id === sport) ?? SPORTS[0];
  const stats = [...(STAT_CHOICES[s.group] ?? []), ...TEAM_MARKETS];

  async function find(e: React.FormEvent) {
    e.preventDefault();
    if (!who.trim()) return setMsg("Type a player or team.");
    const kind: SlipKind = TEAM_MARKETS.includes(market) ? (market as SlipKind) : "prop";
    const n = Number(line);
    const row: SlipRow = {
      subject: who.trim(),
      kind,
      market: kind === "prop" ? market : kind,
      line: kind === "moneyline" || !line.trim() || !Number.isFinite(n) ? null : n,
      selection: kind === "prop" || kind === "total" ? side : null,
      odds: null,
      league: s.league,
    };
    setBusy(true);
    setMsg("");
    setFound(null);
    try {
      const r = await fetch("/api/slip/read", { method: "POST", cache: "no-store", headers: { "content-type": "application/json" }, body: JSON.stringify({ rows: [row] }) });
      const d = (await r.json()) as { legs?: ImportLeg[] };
      const hit = d.legs?.[0] ?? null;
      if (!hit?.leg || !hit.game) setMsg(hit?.issue ?? "No game found for that name in the last week or next two weeks.");
      else setFound(hit);
    } catch {
      setMsg("Search failed. Try again.");
    } finally {
      setBusy(false);
    }
  }

  function save() {
    if (!found?.leg || !found.game) return;
    const leg = found.row.kind === "prop" ? { ...found.leg, market: found.row.market } : found.leg;
    const p = pickFromLeg(leg, { home: found.game.home, away: found.game.away }, { book: "Log", date: localDay(found.game.start) });
    addPick({ ...p, status: found.result ?? "open" });
    setMsg(`Logged: ${p.subject} · ${p.market}${found.result ? ` · graded ${found.result}` : ""}`);
    setFound(null);
    setWho("");
    setLine("");
    onDone?.();
  }

  return (
    <form onSubmit={find} className="panel mt-4 grid gap-2 rounded-2xl p-4 sm:grid-cols-[auto_1fr_auto_auto_auto_auto]" data-testid="quick-pick">
      <p className="text-[11px] font-black uppercase tracking-[0.16em] text-purple-200/80 sm:col-span-6">Find the game · live meters on My Live</p>
      <select aria-label="Sport" className="field" value={sport} onChange={(e) => { setSport(e.target.value); const g = SPORTS.find((x) => x.id === e.target.value)?.group ?? "basketball"; setMarket(STAT_CHOICES[g]?.[0] ?? "points"); }}>
        {SPORTS.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
      </select>
      <input aria-label="Player or team" className="field" value={who} onChange={(e) => setWho(e.target.value)} placeholder={s.group === "tennis" ? "e.g. Iga Swiatek" : "Player or team"} autoComplete="off" data-testid="quick-who" />
      <select aria-label="Stat" className="field" value={market} onChange={(e) => setMarket(e.target.value)} data-testid="quick-stat">
        {stats.map((m) => <option key={m} value={m}>{m}</option>)}
      </select>
      <input aria-label="Line" className="field w-24" inputMode="decimal" value={line} onChange={(e) => setLine(e.target.value)} placeholder="Line" disabled={market === "moneyline"} data-testid="quick-line" />
      <select aria-label="Side" className="field" value={side} onChange={(e) => setSide(e.target.value as "Over" | "Under")} disabled={market === "moneyline" || market === "spread"}>
        <option value="Over">More / Over</option>
        <option value="Under">Less / Under</option>
      </select>
      <button type="submit" disabled={busy} className="rounded-xl border border-purple-400/60 bg-purple-500/25 px-3 py-2 text-sm font-bold text-white" data-testid="quick-find">
        {busy ? "Finding…" : "Find"}
      </button>
      {found?.game ? (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm sm:col-span-6" data-testid="quick-found">
          <span className="rounded bg-white/10 px-1.5 text-[10px] font-black uppercase text-zinc-300">{found.game.league}</span>
          <span className="font-bold text-white">{found.leg?.athleteName ?? found.row.subject}</span>
          <span className="text-zinc-400">{found.game.awayName ?? found.game.away} vs {found.game.homeName ?? found.game.home} · {when(found.game)}</span>
          {found.result ? <span className="font-black text-[color:var(--gold)]">{found.result === "win" ? "W" : found.result === "loss" ? "L" : "P"}</span> : null}
          <button type="button" onClick={save} className="ml-auto rounded-lg border border-[color:var(--plus)]/60 bg-[color:var(--plus)]/15 px-3 py-1 text-xs font-black text-white" data-testid="quick-save">
            Log it
          </button>
        </div>
      ) : null}
      {msg ? <p className="text-xs text-zinc-400 sm:col-span-6" data-testid="quick-msg">{msg}</p> : null}
    </form>
  );
}
