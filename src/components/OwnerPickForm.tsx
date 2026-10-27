"use client";
import { useMemo, useState } from "react";
import type { Game } from "@/lib/slate";
import { DAILY_PICK_NAME, ownerPickText, type OwnerMarket, type OwnerPick, type OwnerSlot } from "@/lib/ownerPick";

const btn = (on: boolean) => "rounded-xl px-3 py-2 text-[12px] font-bold " + (on ? "bg-[color:var(--gold)] text-black" : "bg-white/5 text-zinc-300");

export default function OwnerPickForm({ games, posted }: { games: Game[]; posted: Record<OwnerSlot, OwnerPick | null> }) {
  const [slot, setSlot] = useState<OwnerSlot>("free");
  const [gid, setGid] = useState(games[0] ? `${games[0].league}:${games[0].id}` : "");
  const [market, setMarket] = useState<OwnerMarket>("spread");
  const [side, setSide] = useState("");
  const [note, setNote] = useState("");
  const [notify, setNotify] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const g = useMemo(() => games.find((x) => `${x.league}:${x.id}` === gid) ?? null, [games, gid]);
  const p = g?.price;
  const opts: { v: string; t: string }[] = !g || !p ? [] : market === "total"
    ? p.total === null ? [] : [{ v: "Over", t: `Over ${p.total} ${p.overJuice ?? ""}` }, { v: "Under", t: `Under ${p.total} ${p.underJuice ?? ""}` }]
    : market === "spread"
      ? [p.awaySpread && { v: g.away.abbr, t: `${g.away.abbr} ${p.awaySpread} ${p.awaySpreadJuice ?? ""}` }, p.homeSpread && { v: g.home.abbr, t: `${g.home.abbr} ${p.homeSpread} ${p.homeSpreadJuice ?? ""}` }].filter(Boolean) as { v: string; t: string }[]
      : [p.awayMl && { v: g.away.abbr, t: `${g.away.abbr} ${p.awayMl}` }, p.homeMl && { v: g.home.abbr, t: `${g.home.abbr} ${p.homeMl}` }].filter(Boolean) as { v: string; t: string }[];
  async function post() {
    if (!g || !side) return setMsg("Pick a game and a side.");
    setMsg("Posting…");
    const r = await fetch("/api/ownerpick", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ slot, league: g.league, gameId: g.id, market, side, note, notify: notify ? "1" : "0" }) });
    const j = await r.json().catch(() => ({}));
    setMsg(r.ok ? `Posted ${slot === "vip" ? "VIP" : "Free"} ${DAILY_PICK_NAME}: ${j.text}` : j.error ?? "Could not post.");
  }
  return (
    <div className="space-y-4" data-testid="ownerpick-form">
      <div className="foil-tile rounded-2xl p-3 text-[12px] text-zinc-300">
        {(["vip", "free"] as const).map((s) => <div key={s}>{s === "vip" ? "VIP" : "Free"} today: {posted[s] ? `${posted[s]!.label} · ${ownerPickText(posted[s]!)} ${posted[s]!.odds ?? ""}` : "not posted"}</div>)}
      </div>
      <div className="flex gap-2">{(["free", "vip"] as const).map((s) => <button key={s} className={btn(slot === s)} onClick={() => setSlot(s)}>{s === "vip" ? "VIP slot" : "Free slot"}</button>)}</div>
      {games.length ? (
        <select className="w-full rounded-xl bg-white/5 p-3 text-sm text-white" value={gid} onChange={(e) => { setGid(e.target.value); setSide(""); }}>
          {games.map((x) => <option key={x.id} value={`${x.league}:${x.id}`}>{x.leagueLabel} · {x.away.abbr} @ {x.home.abbr}</option>)}
        </select>
      ) : <p className="text-sm text-zinc-400">No games with a DraftKings number left today.</p>}
      <div className="flex gap-2">{(["spread", "total", "ml"] as const).map((m) => <button key={m} className={btn(market === m)} onClick={() => { setMarket(m); setSide(""); }}>{m === "ml" ? "Moneyline" : m[0].toUpperCase() + m.slice(1)}</button>)}</div>
      <div className="flex flex-wrap gap-2">{opts.map((o) => <button key={o.v} className={btn(side === o.v)} onClick={() => setSide(o.v)}>{o.t}</button>)}</div>
      <input maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Short note (optional)" className="w-full rounded-xl bg-white/5 p-3 text-sm text-white" />
      {slot === "vip" ? <label className="flex items-center gap-2 text-[12px] text-zinc-400"><input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} /> Quiet alert to VIPs who turned on VIP drop alerts</label> : null}
      <button onClick={post} className="w-full rounded-xl bg-[color:var(--gold)] py-3 text-sm font-black text-black">Post</button>
      {msg ? <p className="text-[12px] text-zinc-300">{msg}</p> : null}
      <p className="text-[11px] text-zinc-500">You can replace today&apos;s pick until its game starts. Graded on the ESPN final.</p>
    </div>
  );
}
