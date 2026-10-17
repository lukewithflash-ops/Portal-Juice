"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { usePrefs } from "@/components/Prefs";
import { gameRoute } from "@/lib/gameRoute";
import { formatPrice } from "@/lib/odds";
import { refreshVip, useVip } from "@/lib/vipClient";
import { CHANCE_LABEL, VIP_NOTE, type VipPick, type VipRecord, type VipTeaser } from "@/lib/vipCore";

type Row = VipPick | VipTeaser;
type Data = {
  date: string;
  access: { vip: boolean; signedIn: boolean; stripeReady: boolean; waiting: boolean; manage: boolean; earlyAccess: boolean; source: string | null; plan: string | null; periodEnd: string | null };
  price: { monthly: string; yearly: string };
  picks: Row[];
  record: VipRecord;
  history: VipPick[];
};

const LEAGUE: Record<string, string> = { nfl: "NFL", nba: "NBA", mlb: "MLB", nhl: "NHL", ncaaf: "CFB" };
export const leagueName = (l: string) => LEAGUE[l] ?? l.toUpperCase();

export function ptTime(iso: string, day = true): string {
  const d = new Date(iso);
  return d.toLocaleString("en-US", { timeZone: "America/Los_Angeles", ...(day ? { weekday: "short" } : {}), hour: "numeric", minute: "2-digit" }) + " PT";
}

const isFull = (r: Row): r is VipPick => !("locked" in r);

function TierChip({ tier }: { tier: string }) {
  const tone = tier === "Max" ? "bg-[color:var(--gold)] text-black" : tier === "High" ? "bg-[color:var(--plus)] text-black" : "bg-white/15 text-white";
  return <span className={"rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-wider " + tone}>{tier}</span>;
}

export function ResultChip({ r }: { r: string | null }) {
  if (!r) return <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-black uppercase text-zinc-300">Open</span>;
  const t = r === "win" ? ["W", "bg-[color:var(--plus)] text-black"] : r === "loss" ? ["L", "bg-[color:var(--minus)] text-white"] : ["P", "bg-white/20 text-white"];
  return <span className={"rounded-full px-2 py-0.5 text-[10px] font-black " + t[1]}>{t[0]}</span>;
}

export function RecordStrip({ rec, link = true }: { rec: VipRecord; link?: boolean }) {
  const graded = rec.wins + rec.losses + rec.pushes;
  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4" data-testid="vip-record">
      <div className="flex items-center justify-between">
        <h2 className="text-[12px] font-semibold uppercase tracking-[0.12em] text-zinc-500">VIP record</h2>
        {link ? (
          <Link href="/vip/record" className="text-[12px] font-bold text-[color:var(--gold)]">
            Every pick →
          </Link>
        ) : null}
      </div>
      <div className="mt-2 flex items-end gap-4">
        <div className="big-num tabular text-3xl font-black text-[color:var(--flat)]" data-testid="vip-wlp">
          {rec.wins}–{rec.losses}
          {rec.pushes ? `–${rec.pushes}` : ""}
        </div>
        <div className="pb-1 text-[13px] text-zinc-400">
          {rec.rate !== null ? <span className="font-bold text-white">{rec.rate}% hit</span> : "No finals yet"}
          {rec.streak ? (
            <span className={"ml-2 font-bold " + (rec.streak.kind === "W" ? "text-[color:var(--plus)]" : "text-[color:var(--minus)]")}>
              {rec.streak.kind === "W" ? "🔥 " : ""}
              {rec.streak.kind}
              {rec.streak.n} streak
            </span>
          ) : null}
        </div>
      </div>
      {rec.bySport.length ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {rec.bySport.map((s) => (
            <span key={s.league} className="tabular rounded-lg bg-white/5 px-2 py-1 text-[12px] text-zinc-300">
              {leagueName(s.league)} {s.wins}–{s.losses}
              {s.pushes ? `–${s.pushes}` : ""}
            </span>
          ))}
        </div>
      ) : null}
      <p className="mt-2 text-[11px] text-zinc-500">
        {graded ? `${graded} graded${rec.open ? `, ${rec.open} open` : ""}. ` : ""}Every VIP pick is saved before its game starts and graded from the ESPN final. Public to everyone. {VIP_NOTE}
      </p>
    </section>
  );
}

function FullPick({ p }: { p: VipPick }) {
  const { odds } = usePrefs();
  return (
    <li className="gold-edge rounded-2xl" data-testid="vip-pick">
      <div className="foil-tile p-4">
        <div className="flex items-center gap-2 text-[12px] text-zinc-400">
          <TierChip tier={p.tier} />
          <span className="font-bold text-zinc-300">{leagueName(p.league)}</span>
          <Link href={gameRoute(p.league, p.gameId)} className="truncate underline-offset-2 hover:underline">
            {p.game}
          </Link>
          <span className="ml-auto shrink-0">{ptTime(p.start)}</span>
        </div>
        <div className="mt-2 flex items-start gap-2">
          <div className="min-w-0 flex-1 text-[19px] font-black leading-6 text-[color:var(--flat)]">{p.title}</div>
          <ResultChip r={p.result} />
        </div>
        <div className="mt-1 flex flex-wrap items-baseline gap-x-3 text-[12px]">
          <span className="font-bold text-white">
            {CHANCE_LABEL}: <span className="text-[color:var(--plus)]">{Math.round(p.chance)}%</span>
          </span>
          {p.odds !== null ? (
            <span className="text-zinc-300">
              {p.provider ?? "DraftKings"} {formatPrice(p.odds, odds)}
            </span>
          ) : null}
        </div>
        <ul className="mt-2 space-y-1 text-[13px] leading-snug text-zinc-200">
          {p.reasons.map((r) => (
            <li key={r} className="flex gap-2">
              <span className="text-[color:var(--plus)]" aria-hidden>
                ✓
              </span>
              <span>{r}</span>
            </li>
          ))}
          {p.risk ? (
            <li className="flex gap-2 text-zinc-400">
              <span className="text-[color:var(--minus)]" aria-hidden>
                !
              </span>
              <span>Against: {p.risk}</span>
            </li>
          ) : null}
        </ul>
        {p.final ? <p className="mt-2 text-[12px] text-zinc-400">Final {p.final}</p> : null}
        <p className="mt-2 text-[11px] text-zinc-500">
          Locked {ptTime(p.createdAt)} · chance blends the DK price with how this line did recently · {VIP_NOTE}
        </p>
      </div>
    </li>
  );
}

function LockedPick({ p }: { p: VipTeaser }) {
  return (
    <li className="relative overflow-hidden rounded-2xl border border-[color:var(--gold)]/30 bg-white/[0.03] p-4" data-testid="vip-locked">
      <div className="flex items-center gap-2 text-[12px] text-zinc-400">
        <TierChip tier={p.tier} />
        <span className="font-bold text-zinc-300">{leagueName(p.league)}</span>
        <span className="truncate">{p.game}</span>
        <span className="ml-auto shrink-0">{ptTime(p.start)}</span>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <span aria-hidden className="select-none rounded-md bg-white/10 px-2 text-[19px] font-black text-transparent blur-[6px]">
          Locked VIP pick here
        </span>
        <span className="ml-auto text-[13px] font-bold text-[color:var(--gold)]">🔒 VIP</span>
      </div>
      <p className="mt-1 text-[12px] text-zinc-500">{p.kind === "prop" ? "Player prop" : p.kind === "total" ? "Game total" : p.kind === "spread" ? "Spread" : "Moneyline"} · reasons and hit chance for VIP</p>
    </li>
  );
}

function Join({ d, onDone }: { d: Data; onDone: () => void }) {
  const [plan, setPlan] = useState<"yearly" | "monthly">("yearly");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const a = d.access;
  const post = async (url: string, body: unknown) => {
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const j = await r.json().catch(() => ({}));
      if (j.url) {
        window.location.href = j.url;
        return;
      }
      if (!r.ok) setMsg(j.error ?? "Something went wrong.");
      else onDone();
    } finally {
      setBusy(false);
    }
  };
  if (a.vip)
    return (
      <div className="mt-3 flex flex-wrap items-center gap-2" data-testid="vip-member">
        <span className="rounded-full bg-[color:var(--gold)] px-3 py-1 text-[12px] font-black text-black">💎 You’re VIP</span>
        {a.earlyAccess ? <span className="rounded-full border border-white/15 px-2 py-1 text-[11px] font-bold text-zinc-300">Early access on</span> : null}
        {a.manage ? (
          <button type="button" disabled={busy} onClick={() => post("/api/vip/portal", {})} className="press rounded-full border border-white/15 px-3 py-1 text-[12px] font-bold text-zinc-200">
            Manage plan
          </button>
        ) : null}
        {msg ? <p className="w-full text-[12px] text-[color:var(--minus)]">{msg}</p> : null}
      </div>
    );
  if (!a.stripeReady)
    return (
      <div className="mt-3" data-testid="vip-waitlist">
        <div className="text-[15px] font-black text-[color:var(--gold)]">VIP opens soon</div>
        {a.waiting ? (
          <p className="mt-1 text-[13px] text-zinc-300" data-testid="vip-waiting">
            ✓ You’re on the list. We’ll let you know when VIP opens.
          </p>
        ) : (
          <div className="mt-2 flex gap-2">
            {!a.signedIn ? (
              <input
                type="email"
                inputMode="email"
                autoComplete="email"
                placeholder="you@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="min-w-0 flex-1 rounded-xl border border-white/15 bg-black/40 px-3 py-2.5 text-[15px] text-white placeholder:text-zinc-600"
                data-testid="vip-wait-email"
              />
            ) : null}
            <button
              type="button"
              disabled={busy || (!a.signedIn && !email.includes("@"))}
              onClick={() => post("/api/vip/waitlist", a.signedIn ? {} : { email })}
              className="press shrink-0 rounded-xl bg-[color:var(--gold)] px-4 py-2.5 text-[15px] font-black text-black disabled:opacity-50"
              data-testid="vip-wait-join"
            >
              Join the waitlist
            </button>
          </div>
        )}
        {msg ? <p className="mt-1 text-[12px] text-[color:var(--minus)]">{msg}</p> : null}
      </div>
    );
  return (
    <div className="mt-3" data-testid="vip-join">
      <div className="seg grid grid-cols-2 rounded-xl border border-white/10 p-1 text-[13px] font-bold">
        {(["yearly", "monthly"] as const).map((p) => (
          <button key={p} type="button" aria-pressed={plan === p} onClick={() => setPlan(p)} className={"press rounded-lg px-2 py-2 " + (plan === p ? "bg-[color:var(--gold)] text-black" : "text-zinc-300")}>
            {p === "yearly" ? `${d.price.yearly} · save 50%` : d.price.monthly}
          </button>
        ))}
      </div>
      {a.signedIn ? (
        <button type="button" disabled={busy} onClick={() => post("/api/vip/checkout", { plan })} className="press mt-2 w-full rounded-xl bg-[color:var(--gold)] px-4 py-3 text-[16px] font-black text-black disabled:opacity-60" data-testid="vip-checkout">
          {busy ? "Opening checkout…" : "Join VIP"}
        </button>
      ) : (
        <Link href="/account?next=/vip" className="press mt-2 block w-full rounded-xl bg-[color:var(--gold)] px-4 py-3 text-center text-[16px] font-black text-black" data-testid="vip-signin">
          Sign in to join VIP
        </Link>
      )}
      <p className="mt-1.5 text-center text-[11px] text-zinc-500">Cancel any time. Secure checkout by Stripe.</p>
      {msg ? <p className="mt-1 text-[12px] text-[color:var(--minus)]">{msg}</p> : null}
    </div>
  );
}

const PERKS = [
  ["💎", "Daily VIP picks", "2 to 5 a day, only when the numbers line up. Zero on days nothing clears the bar."],
  ["🔥", "Full prop heat map", "Every player, every line, colored by how often it hit."],
  ["📈", "Line-move alerts", "A push when a total or spread in a game you follow moves a full point."],
  ["🧠", "Unlimited Ask Portal AI", "Plus unlimited photo slip reads."],
  ["🔎", "Deeper breakdowns", "Every reason for and against on any leg."],
];

export default function VipClient() {
  const [d, setD] = useState<Data | null>(null);
  const [err, setErr] = useState(false);
  const me = useVip();
  const load = useCallback(() => {
    fetch("/api/vip", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((j: Data) => setD(j))
      .catch(() => setErr(true));
  }, []);
  useEffect(load, [load, me.vip, me.signedIn]);
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("joined")) {
      const t = setTimeout(() => {
        refreshVip();
        load();
      }, 2500);
      return () => clearTimeout(t);
    }
  }, [load]);
  if (err && !d) return <p className="text-sm text-zinc-400">VIP didn’t load. Pull to refresh.</p>;
  if (!d)
    return (
      <div className="space-y-3">
        <div className="skel h-40 rounded-2xl" />
        <div className="skel h-24 rounded-2xl" />
      </div>
    );
  const open = d.picks.filter((p) => !p.result);
  return (
    <div className="mx-auto max-w-xl space-y-5" data-testid="vip-page">
      <section className="gold-edge rounded-2xl">
        <div className="foil-tile p-4">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-black uppercase tracking-[0.24em] tone-gold">Portal VIP</span>
            {d.record.streak?.kind === "W" && d.record.streak.n > 1 ? <span className="ml-auto text-[11px] font-black text-[color:var(--plus)]">🔥 W{d.record.streak.n} streak</span> : null}
          </div>
          <h2 className="mt-1 text-[20px] font-black leading-6 text-[color:var(--flat)]">The day’s strongest picks, with the numbers behind each one.</h2>
          <p className="mt-1 text-[13px] text-zinc-400">Built only from ESPN stats, game logs, injuries and DraftKings lines. {VIP_NOTE}</p>
          <Join d={d} onDone={load} />
        </div>
      </section>

      <section>
        <h2 className="mb-2 px-1 text-[12px] font-semibold uppercase tracking-[0.12em] text-zinc-500">VIP picks</h2>
        {d.picks.length ? (
          <ul className="space-y-3">{d.picks.map((p) => (isFull(p) ? <FullPick key={p.id} p={p} /> : <LockedPick key={p.id} p={p} />))}</ul>
        ) : (
          <p className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-[13px] text-zinc-400" data-testid="vip-none">
            No pick has cleared the bar yet. The engine checks upcoming games every 15 minutes and posts only when the data lines up. Zero picks beats a weak pick.
          </p>
        )}
        {!d.access.vip && open.length ? <p className="mt-2 px-1 text-[12px] text-zinc-500">Free: sport, game, start time and tier. VIP: the pick, every reason and the hit chance.</p> : null}
      </section>

      <RecordStrip rec={d.record} />

      {!d.access.vip ? (
        <section>
          <h2 className="mb-2 px-1 text-[12px] font-semibold uppercase tracking-[0.12em] text-zinc-500">What VIP gets</h2>
          <ul className="divide-y divide-white/5 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]">
            {PERKS.map(([i, t, s]) => (
              <li key={t} className="flex gap-3 px-4 py-3">
                <span aria-hidden className="text-lg">
                  {i}
                </span>
                <span>
                  <span className="block text-[15px] font-bold text-white">{t}</span>
                  <span className="block text-[13px] text-zinc-500">{s}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 text-[12px] leading-relaxed text-zinc-400">
        <h2 className="mb-1 text-[12px] font-semibold uppercase tracking-[0.12em] text-zinc-500">How VIP picks are made</h2>
        <p>
          Every leg on upcoming games is scored from ESPN data: recent form, season and home/road splits, matchup history, injuries, and DraftKings line movement. A leg only becomes a VIP pick if it leans strong, has at least three
          data reasons and few against, hit this exact line in at least 70% of the player’s last 8–10 games (60% of the last 5+ for teams), has a DraftKings price, and clears a 55% model hit chance. At most two per game and five a day.
          Picks lock at least 30 minutes before start and are never edited. W/L/P only. {VIP_NOTE}
        </p>
      </section>
    </div>
  );
}
