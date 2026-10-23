"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Sheet } from "@/components/LivePosition";
import { Avatar, ItemArt } from "@/components/Cosmetics";
import { applyTheme } from "@/components/ThemeApply";
import { ITEMS, KIND_LABEL, NO_VALUE_COPY, RARITY_LABEL, SOLD_OUT_RULE, MARKET_FEE_PCT, itemOdds, itemOf, marketFee, type Box, type Item, type Kind, type Look, type Slot } from "@/lib/coinsCore";
import { haptic, isNativeApp } from "@/lib/native";

type Inst = { id: string; item: string; serial: number | null; history: { ev: string; to: string; from?: string; price?: number; ts: number }[] };
type Listing = { id: string; item: string; name: string; serial: number | null; sellerHandle: string; price: number; fee: number };
type Ch = { id: string; period: "day" | "week"; label: string; hint: string; reward: number; href: string; done: boolean; claimed: boolean };
type State = { enabled: boolean; signedIn?: boolean; balance: number; inventory: Inst[]; look: Look; challenges: Ch[]; log: { ts: number; delta: number; why: string }[]; market: Listing[]; myListings: Listing[]; supply: Record<string, { minted: number; cap: number }>; boxes: Box[]; packs: { id: string; coins: number; price: string; name: string }[] };

const Coin = ({ n, big }: { n: number; big?: boolean }) => (
  <span className={`tabular inline-flex items-center gap-1 font-black text-[color:var(--gold)] ${big ? "text-[26px]" : "text-[13px]"}`}><span className="coin-dot" aria-hidden />{n.toLocaleString()}</span>
);
const Rar = ({ r }: { r: Item["rarity"] }) => <span className={`rar-chip rar-${r}`}>{RARITY_LABEL[r]}</span>;
const KINDS: Kind[] = ["theme", "jersey", "frame", "tag", "font", "emote"];
type IapPlugin = { purchaseProduct: (o: { productIdentifier: string; productType: string }) => Promise<{ transactionId?: string }> };
const iap = (): IapPlugin | null => (typeof window === "undefined" ? null : ((window as unknown as { Capacitor?: { Plugins?: Record<string, IapPlugin> } }).Capacitor?.Plugins?.NativePurchases ?? null));

export default function CoinsClient() {
  const [s, setS] = useState<State | null>(null);
  const [tab, setTab] = useState<"shop" | "boxes" | "resale" | "mine">("shop");
  const [kind, setKind] = useState<Kind>("theme");
  const [box, setBox] = useState<Box | null>(null);
  const [won, setWon] = useState<{ item: Item; serial: number | null } | null>(null);
  const [sell, setSell] = useState<Inst | null>(null);
  const [price, setPrice] = useState("");
  const [hist, setHist] = useState<Inst | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => fetch("/api/coins", { cache: "no-store" }).then((r) => r.json()).then(setS).catch(() => {}), []);
  useEffect(() => {
    const t = setTimeout(load, 0);
    return () => clearTimeout(t);
  }, [load]);
  async function act(body: Record<string, unknown>, ok?: string) {
    setBusy(true);
    setErr(null);
    setMsg(null);
    const r = await fetch("/api/coins", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ req: crypto.randomUUID(), ...body }) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) {
      setErr(j.error ?? "That didn't work.");
      haptic("error");
      return null;
    }
    if (j.state) setS({ enabled: true, signedIn: true, ...j.state });
    if (ok) setMsg(ok);
    haptic("success");
    return j;
  }
  const owned = useMemo(() => new Map((s?.inventory ?? []).map((i) => [i.item, i])), [s]);
  if (!s) return <div className="skel h-40" />;
  if (!s.signedIn) return <section className="panel rounded-2xl p-4 text-sm text-zinc-300">Sign in to earn coins and keep your style on your account. <Link href="/account" className="font-bold text-purple-200 underline">Sign in</Link></section>;
  const equip = async (slot: Slot, id: string | null) => {
    if (await act({ action: "equip", slot, id }, "Equipped.")) {
      if (slot === "theme") applyTheme(id ?? "t-void");
      window.dispatchEvent(new Event("pj-look"));
    }
  };
  const native = isNativeApp() && !!iap();
  return (
    <div className="space-y-4" data-testid="coins">
      <section className="panel rounded-2xl p-4">
        <div className="flex items-center gap-3">
          <Avatar handle="me" look={s.look} size={52} />
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-purple-200">Your coins</p>
            <Coin n={s.balance} big />
          </div>
        </div>
        <p className="mt-3 text-[12px] leading-snug text-zinc-500" data-testid="coins-novalue">{NO_VALUE_COPY}</p>
      </section>

      <section className="panel rounded-2xl p-4">
        <h2 className="text-xs font-black uppercase tracking-[0.18em] text-purple-200">Free coins · challenges</h2>
        <ul className="mt-2 divide-y divide-white/5">
          {s.challenges.map((c) => (
            <li key={c.id} className="flex items-center gap-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="text-[15px] font-bold text-white">{c.label} <span className="ml-1 text-[11px] font-semibold uppercase text-zinc-500">{c.period === "day" ? "today" : "this week"}</span></p>
                <p className="text-[12px] text-zinc-500">{c.hint}</p>
              </div>
              {c.claimed ? <span className="text-[12px] font-bold text-zinc-500">Claimed</span> : c.done ? (
                <button type="button" disabled={busy} onClick={() => act({ action: "claim", id: c.id }, `+${c.reward} coins`)} className="press rounded-lg bg-[color:var(--plus)] px-3 py-1.5 text-[13px] font-black text-black">Claim {c.reward}</button>
              ) : <Link href={c.href} className="rounded-lg border border-white/15 px-2.5 py-1 text-[12px] font-bold text-zinc-300">+{c.reward}</Link>}
            </li>
          ))}
        </ul>
      </section>

      <div className="flex gap-1 rounded-xl bg-white/[0.04] p-1" role="tablist">
        {(["shop", "boxes", "resale", "mine"] as const).map((t) => (
          <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={`flex-1 rounded-lg py-2 text-[13px] font-black ${tab === t ? "bg-purple-600/50 text-white" : "text-zinc-400"}`}>{{ shop: "Shop", boxes: "Boxes", resale: "Resale", mine: "My items" }[t]}</button>
        ))}
      </div>

      {tab === "shop" || tab === "mine" ? (
        <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1">
          {KINDS.map((k) => <button key={k} type="button" onClick={() => setKind(k)} className={`shrink-0 rounded-full border px-3 py-1 text-[12px] font-bold ${kind === k ? "border-purple-400 text-white" : "border-white/10 text-zinc-400"}`}>{KIND_LABEL[k]}</button>)}
        </div>
      ) : null}

      {tab === "shop" ? (
        <div className="grid grid-cols-2 gap-2.5" data-testid="coins-shop">
          {ITEMS.filter((i) => i.kind === kind).map((i) => {
            const have = i.price === 0 || owned.has(i.id);
            const on = (s.look as Record<string, string | undefined>)[i.kind] === i.id;
            const sup = s.supply[i.id];
            return (
              <div key={i.id} className={`cos-tile rar-${i.rarity} flex flex-col items-center gap-2 p-3`}>
                <div className="grid h-16 place-items-center"><ItemArt item={i} /></div>
                <p className="text-center text-[14px] font-bold text-white">{i.name}</p>
                <Rar r={i.rarity} />
                {sup ? <p className="tabular text-[11px] text-zinc-500">Limited · {sup.minted}/{sup.cap} out</p> : null}
                {have ? (
                  i.kind === "emote" ? <span className="text-[12px] font-bold text-zinc-400">Unlocked</span> : on ? <span className="text-[12px] font-bold text-[color:var(--plus)]">Equipped</span> : <button type="button" onClick={() => equip(i.kind as Slot, i.id)} className="press rounded-lg border border-purple-400/60 px-3 py-1 text-[12px] font-black text-purple-100">Equip</button>
                ) : i.price ? (
                  <button type="button" disabled={busy || s.balance < i.price} onClick={() => act({ action: "buy", id: i.id }, `${i.name} unlocked.`)} className="press rounded-lg bg-purple-600/70 px-3 py-1 text-[12px] font-black text-white disabled:opacity-40"><Coin n={i.price} /></button>
                ) : <span className="text-[11px] text-zinc-500">Box or resale only</span>}
              </div>
            );
          })}
        </div>
      ) : null}

      {tab === "boxes" ? (
        <div className="space-y-2.5" data-testid="coins-boxes">
          {s.boxes.map((b) => (
            <button key={b.id} type="button" onClick={() => setBox(b)} className="cos-tile rar-epic flex w-full items-center gap-3 p-3 text-left">
              <span className="grid h-12 w-12 place-items-center rounded-xl bg-black/40 text-[22px]">{itemOdds(b).find((x) => x.item.rarity === "legendary")?.item.icon ?? "✦"}</span>
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-bold text-white">{b.name}</span>
                <span className="tabular block text-[11px] text-zinc-400">{(["common", "rare", "epic", "legendary"] as const).map((r) => `${RARITY_LABEL[r]} ${b.odds[r]}%`).join(" · ")}</span>
              </span>
              <Coin n={b.price} />
            </button>
          ))}
          <p className="text-[11px] text-zinc-500">Boxes cost coins only. Exact odds are shown before you open one. {NO_VALUE_COPY}</p>
        </div>
      ) : null}

      {tab === "resale" ? (
        <div className="space-y-2" data-testid="coins-resale">
          {s.myListings.length ? <h3 className="text-[11px] font-black uppercase tracking-[0.18em] text-zinc-400">Your listings</h3> : null}
          {s.myListings.map((l) => (
            <div key={l.id} className="panel flex items-center gap-3 rounded-xl p-2.5">
              <ItemArt item={itemOf(l.item)!} size={36} />
              <span className="flex-1 text-[14px] font-bold text-white">{l.name}{l.serial ? <span className="tabular text-zinc-500"> #{l.serial}</span> : null}</span>
              <Coin n={l.price} />
              <button type="button" onClick={() => act({ action: "unlist", id: l.id }, "Back in your items.")} className="text-[12px] font-bold text-zinc-400">Cancel</button>
            </div>
          ))}
          <h3 className="text-[11px] font-black uppercase tracking-[0.18em] text-zinc-400">For sale</h3>
          {!s.market.filter((l) => !s.myListings.some((m) => m.id === l.id)).length ? <p className="text-[13px] text-zinc-500">Nothing listed right now. List an item from My items.</p> : null}
          {s.market.filter((l) => !s.myListings.some((m) => m.id === l.id)).map((l) => {
            const it = itemOf(l.item)!;
            return (
              <div key={l.id} className={`cos-tile rar-${it.rarity} flex items-center gap-3 p-2.5`}>
                <ItemArt item={it} size={40} />
                <span className="min-w-0 flex-1">
                  <span className="block text-[14px] font-bold text-white">{l.name}{l.serial ? <span className="tabular text-[color:var(--gold)]"> #{l.serial}</span> : null}</span>
                  <span className="block text-[11px] text-zinc-500">@{l.sellerHandle} · <Rar r={it.rarity} /></span>
                </span>
                <button type="button" disabled={busy || s.balance < l.price} onClick={() => act({ action: "market-buy", id: l.id }, `${l.name} is yours.`)} className="press rounded-lg bg-purple-600/70 px-3 py-1.5 text-[12px] font-black text-white disabled:opacity-40"><Coin n={l.price} /></button>
              </div>
            );
          })}
          <p className="text-[11px] text-zinc-500">Trades are coins for items inside Portal Juice only. Sellers get the price minus a {MARKET_FEE_PCT}% coin fee. {NO_VALUE_COPY}</p>
        </div>
      ) : null}

      {tab === "mine" ? (
        <div className="grid grid-cols-2 gap-2.5" data-testid="coins-mine">
          {s.inventory.filter((x) => itemOf(x.item)?.kind === kind).map((x) => {
            const it = itemOf(x.item)!;
            const on = (s.look as Record<string, string | undefined>)[it.kind] === it.id;
            return (
              <div key={x.id} className={`cos-tile rar-${it.rarity} flex flex-col items-center gap-1.5 p-3`}>
                <div className="grid h-14 place-items-center"><ItemArt item={it} /></div>
                <p className="text-center text-[14px] font-bold text-white">{it.name}{x.serial ? <span className="tabular text-[color:var(--gold)]"> #{x.serial}</span> : null}</p>
                <div className="flex gap-2 text-[12px] font-bold">
                  {it.kind !== "emote" ? (on ? <button type="button" onClick={() => equip(it.kind as Slot, null)} className="text-zinc-400">Unequip</button> : <button type="button" onClick={() => equip(it.kind as Slot, it.id)} className="text-purple-200">Equip</button>) : null}
                  <button type="button" onClick={() => { setSell(x); setPrice(String(it.price ?? 500)); }} className="text-zinc-300">Sell</button>
                  <button type="button" onClick={() => setHist(x)} className="text-zinc-500">History</button>
                </div>
              </div>
            );
          })}
          {!s.inventory.some((x) => itemOf(x.item)?.kind === kind) ? <p className="col-span-2 text-[13px] text-zinc-500">None yet. Grab some in the Shop or a box.</p> : null}
        </div>
      ) : null}

      <section className="panel rounded-2xl p-4" data-testid="coins-packs">
        <h2 className="text-xs font-black uppercase tracking-[0.18em] text-purple-200">Get coins</h2>
        {native && s.packs.length ? (
          <div className="mt-2 grid grid-cols-3 gap-2">
            {s.packs.map((p) => (
              <button key={p.id} type="button" disabled={busy} onClick={async () => {
                setErr(null);
                try {
                  const t = await iap()!.purchaseProduct({ productIdentifier: p.id, productType: "inapp" });
                  const r = await fetch("/api/coins/apple", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ transactionId: t.transactionId }) });
                  const j = await r.json();
                  if (!r.ok) throw new Error(j.error);
                  setMsg(`+${p.coins} coins`);
                  load();
                } catch (e) {
                  setErr((e as Error).message || "Purchase didn't go through.");
                }
              }} className="cos-tile rar-rare flex flex-col items-center gap-1 p-3">
                <Coin n={p.coins} />
                <span className="text-[13px] font-bold text-white">{p.price}</span>
              </button>
            ))}
          </div>
        ) : <p className="mt-1 text-[13px] text-zinc-400">Earn coins free with challenges.</p>}
      </section>

      {s.log.length ? (
        <details className="panel rounded-2xl p-4">
          <summary className="text-xs font-black uppercase tracking-[0.18em] text-zinc-400">Coin history</summary>
          <ul className="mt-2 space-y-1 text-[13px]">
            {s.log.map((l, i) => <li key={i} className="flex justify-between gap-2"><span className="text-zinc-300">{l.why}</span><span className={`tabular font-bold ${l.delta > 0 ? "text-[color:var(--plus)]" : "text-zinc-400"}`}>{l.delta > 0 ? "+" : ""}{l.delta}</span></li>)}
          </ul>
        </details>
      ) : null}

      {msg ? <p className="text-sm font-bold text-[color:var(--plus)]" role="status">{msg}</p> : null}
      {err ? <p className="text-sm font-bold text-[color:var(--minus)]" role="alert">{err}</p> : null}

      {box ? (
        <Sheet label={box.name} onClose={() => { setBox(null); setWon(null); }} testid="box-sheet">
          <div className="flex items-baseline justify-between"><h2 className="text-[17px] font-bold text-white">{box.name}</h2><button type="button" onClick={() => { setBox(null); setWon(null); }} className="text-[13px] font-semibold text-zinc-400">Done</button></div>
          {won ? (
            <div className={`cos-tile rar-${won.item.rarity} mt-3 flex flex-col items-center gap-2 p-5`} data-testid="box-won">
              <ItemArt item={won.item} size={72} />
              <p className="text-[17px] font-black text-white">{won.item.name}{won.serial ? <span className="tabular text-[color:var(--gold)]"> #{won.serial}</span> : null}</p>
              <Rar r={won.item.rarity} />
            </div>
          ) : (
            <>
              <p className="mt-1 text-[12px] text-zinc-400">Exact odds for this box:</p>
              <table className="mt-2 w-full text-[13px]" data-testid="box-odds">
                <tbody>
                  {itemOdds(box).sort((a, b) => a.pct - b.pct).map(({ item, pct }) => (
                    <tr key={item.id} className="border-b border-white/5">
                      <td className="py-1.5 pr-2"><span className="inline-flex items-center gap-2"><span className="grid w-8 place-items-center"><ItemArt item={item} size={26} /></span><span className="text-white">{item.name}</span></span></td>
                      <td><Rar r={item.rarity} /></td>
                      <td className="tabular text-right font-bold text-white">{pct.toFixed(pct < 1 ? 2 : 1)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-2 text-[11px] text-zinc-500">{SOLD_OUT_RULE} Paid with coins only.</p>
            </>
          )}
          <button type="button" disabled={busy || s.balance < box.price} onClick={async () => {
            const j = await act({ action: "open", id: box.id });
            if (j?.inst) setWon({ item: itemOf(j.inst.item)!, serial: j.inst.serial });
          }} className="note-add mt-3 w-full rounded-xl py-3 text-[15px] font-black text-white disabled:opacity-40" data-testid="box-open">
            Open for {box.price} coins
          </button>
        </Sheet>
      ) : null}

      {sell ? (
        <Sheet label="Sell item" onClose={() => setSell(null)} testid="sell-sheet">
          <h2 className="text-[17px] font-bold text-white">Sell {itemOf(sell.item)?.name}</h2>
          <form className="mt-3 flex gap-2" onSubmit={async (e) => { e.preventDefault(); if (await act({ action: "list", id: sell.id, price: Number(price) }, "Listed on resale.")) setSell(null); }}>
            <input value={price} onChange={(e) => setPrice(e.target.value.replace(/\D/g, ""))} inputMode="numeric" className="field chat-input flex-1" aria-label="Price in coins" />
            <button type="submit" className="note-add rounded-xl px-4 font-black text-white">List</button>
          </form>
          <p className="mt-2 text-[12px] text-zinc-500">You get {Math.max(0, Number(price || 0) - marketFee(Number(price || 0)))} coins if it sells ({MARKET_FEE_PCT}% fee). It leaves your items until it sells or you cancel. Coins only, no cash value.</p>
        </Sheet>
      ) : null}

      {hist ? (
        <Sheet label="Item history" onClose={() => setHist(null)} testid="hist-sheet">
          <h2 className="text-[17px] font-bold text-white">{itemOf(hist.item)?.name}{hist.serial ? ` #${hist.serial}` : ""}</h2>
          <ul className="mt-2 space-y-1 text-[13px] text-zinc-300">
            {hist.history.map((h, i) => <li key={i}>{new Date(h.ts).toLocaleDateString()} · {h.ev === "sold" ? `@${h.from} → @${h.to} for ${h.price} coins` : `${h.ev.startsWith("box") ? "From a box" : "From the shop"} · @${h.to}`}</li>)}
          </ul>
        </Sheet>
      ) : null}
    </div>
  );
}
