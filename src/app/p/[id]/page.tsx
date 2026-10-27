import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { loadShare } from "@/lib/pickShare";
import { gameRoute } from "@/lib/gameRoute";

export const dynamic = "force-dynamic";

const WORD = { win: "WON", loss: "LOST", push: "PUSH", open: "LIVE / OPEN" } as const;
const COLOR = { win: "var(--gold)", loss: "var(--minus)", push: "var(--push)", open: "#a78bfa" } as const;
const rec = (t: { w: number; l: number; p: number }) => `${t.w}-${t.l}-${t.p}`;

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const v = await loadShare((await params).id).catch(() => null);
  if (!v) return { title: "Pick" };
  const t = `${v.handle ? `@${v.handle}` : "A bettor"}: ${v.parlay ? `${v.legs.length}-leg parlay` : `${v.legs[0].subject} ${v.legs[0].side}`} · ${WORD[v.result]}`;
  return { title: t, description: `Logged record ${rec(v.record)} on Portal Juice.`, openGraph: { title: t }, twitter: { title: t } };
}

export default async function SharedPick({ params }: { params: Promise<{ id: string }> }) {
  const v = await loadShare((await params).id).catch(() => null);
  if (!v) notFound();
  return (
    <div className="mx-auto max-w-md" data-testid="share-pick">
      <div className="foil-tile overflow-hidden rounded-2xl p-4" style={{ borderTop: `3px solid ${COLOR[v.result]}` }}>
        <div className="flex items-center justify-between">
          <div className="text-[13px] font-bold text-purple-200">{v.handle ? `@${v.handle}` : "Portal Juice bettor"}</div>
          <div className="rounded-full px-2.5 py-0.5 text-[11px] font-black" style={{ color: COLOR[v.result], border: `1px solid ${COLOR[v.result]}` }}>{WORD[v.result]}</div>
        </div>
        <div className="mt-1 text-[11px] text-zinc-500">{v.parlay ? `${v.legs.length}-leg parlay` : "Single"} · {v.date}</div>
        <ul className="mt-3 space-y-2">
          {v.legs.map((l, i) => (
            <li key={i} className="flex items-center gap-2 rounded-xl bg-white/[0.03] px-3 py-2" style={{ borderLeft: `3px solid ${COLOR[l.status]}` }}>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-bold text-white">{l.subject}</div>
                <div className="truncate text-[11px] text-zinc-400">{l.market ? `${l.market} · ` : ""}{l.side} · {l.book}</div>
              </div>
              <div className="text-right">
                <div className="tabular text-sm font-black text-white">{l.odds > 0 ? `+${l.odds}` : l.odds}</div>
                <div className="text-[10px] font-black uppercase" style={{ color: COLOR[l.status] }}>{l.status === "open" ? "Open" : WORD[l.status]}</div>
                {l.league && l.gameId && l.status === "open" ? <Link href={gameRoute(l.league, l.gameId)} className="text-[10px] text-[color:var(--portal-green)]">Watch live</Link> : null}
              </div>
            </li>
          ))}
        </ul>
        <div className="mt-4 grid grid-cols-2 gap-2 text-center">
          <div className="rounded-xl bg-white/[0.04] p-2"><div className="text-[10px] uppercase tracking-wider text-zinc-400">Every pick</div><div className="tabular text-lg font-black text-white">{rec(v.record)}</div><div className="text-[10px] text-zinc-500">{v.record.pct === null ? "no graded picks" : `${v.record.pct}% hit`}</div></div>
          <div className="rounded-xl bg-white/[0.04] p-2"><div className="text-[10px] uppercase tracking-wider text-zinc-400">Parlays</div><div className="tabular text-lg font-black text-white">{rec(v.parlayRecord)}</div></div>
        </div>
        <p className="mt-3 text-[10px] text-zinc-500">Record and result come straight from this account&apos;s Portal Juice log and update as games grade. No odds advice, no bets placed here.</p>
      </div>
      <Link href="/" className="mt-4 block text-center text-[13px] font-bold text-[color:var(--portal-green)]">Track your own picks on Portal Juice</Link>
    </div>
  );
}
