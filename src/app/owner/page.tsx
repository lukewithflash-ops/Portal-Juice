import { notFound } from "next/navigation";
import PageHeader from "@/components/PageHeader";
import { currentUser } from "@/lib/auth";
import { isOwner } from "@/lib/vipAccess";
import { dashboard } from "@/lib/metrics";
import { DAILY_PICK_NAME } from "@/lib/ownerPick";

export const dynamic = "force-dynamic";
export const metadata = { title: "Owner", robots: { index: false } };

export default async function OwnerPage() {
  const u = await currentUser().catch(() => null);
  if (!isOwner(u)) notFound();
  const { since, today, rows } = await dashboard(14).catch(() => ({ since: null, today: "", rows: [] }));
  const live = rows.filter((r) => since && r.day >= since);
  const max = Math.max(1, ...live.map((r) => r.active));
  const sum = (k: "active" | "picks" | "fresh") => live.reduce((a, r) => a + r[k], 0);
  const avg = (k: "d1" | "d7") => { const v = live.map((r) => r[k]).filter((x): x is number => x !== null); return v.length ? `${Math.round(v.reduce((a, b) => a + b, 0) / v.length)}%` : "—"; };
  return (
    <>
      <PageHeader title="Owner" sub={since ? `Collecting since ${since}. Real counts only, nothing before that.` : "Collecting starts with the next app open."} />
      <a href="/owner/pick" className="mb-3 block rounded-xl bg-[color:var(--gold)] px-3 py-2 text-center text-sm font-black text-black">Post {DAILY_PICK_NAME}</a>
      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4" data-testid="owner-totals">
        {[["Opens (device-days)", sum("active")], ["New devices/accounts", sum("fresh")], ["Picks logged", sum("picks")], ["Avg D1 / D7", `${avg("d1")} / ${avg("d7")}`]].map(([k, v]) => (
          <div key={String(k)} className="foil-tile rounded-2xl p-3">
            <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-purple-200/80">{k}</div>
            <div className="tabular mt-1 text-2xl font-black text-white">{v}</div>
          </div>
        ))}
      </div>
      <section className="foil-tile overflow-hidden rounded-2xl">
        <table className="w-full text-[12px]">
          <thead className="text-[10px] uppercase tracking-wider text-zinc-400">
            <tr><th className="p-2 text-left">Day (PT)</th><th className="p-2 text-left">Active</th><th className="p-2 text-right">New</th><th className="p-2 text-right">Picks</th><th className="p-2 text-right">D1</th><th className="p-2 text-right">D7</th></tr>
          </thead>
          <tbody>
            {rows.slice().reverse().map((r) => {
              const pre = !since || r.day < since;
              return (
                <tr key={r.day} className="border-t border-white/5">
                  <td className="p-2 text-zinc-300">{r.day}{r.day === today ? " · today" : ""}</td>
                  {pre ? <td colSpan={5} className="p-2 text-zinc-600">not collected yet</td> : (
                    <>
                      <td className="p-2"><div className="flex items-center gap-2"><div className="h-2 rounded-full bg-[color:var(--portal-green)]" style={{ width: `${(r.active / max) * 100}px` }} /><span className="tabular font-bold text-white">{r.active}</span></div></td>
                      <td className="tabular p-2 text-right">{r.fresh}</td>
                      <td className="tabular p-2 text-right">{r.picks}</td>
                      <td className="tabular p-2 text-right">{r.d1 === null ? "—" : `${r.d1}%`}</td>
                      <td className="tabular p-2 text-right">{r.d7 === null ? "—" : `${r.d7}%`}</td>
                    </>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
      <p className="mt-3 text-[11px] text-zinc-500">Active = unique devices or accounts that opened the app that day. Picks = new picks saved by signed-in accounts (device-only logs aren&apos;t counted). D1/D7 = share of that day&apos;s new devices/accounts that came back 1 or 7 days later; blank until that day has passed. Only hashed ids are stored, for 120 days.</p>
    </>
  );
}
