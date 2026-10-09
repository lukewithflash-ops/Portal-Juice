import Link from "next/link";
import WinBar from "@/components/WinBar";
import { OddsText } from "@/components/Prefs";
import type { Entrant, Match } from "@/lib/sports";

function Who({ e, big }: { e: Entrant; big?: boolean }) {
  return (
    <span className={"flex min-w-0 items-center gap-2 " + (e.winner ? "text-white" : "text-zinc-200")}>
      {e.logo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={e.logo} alt="" width={20} height={20} className="h-5 w-5 shrink-0 object-contain" />
      ) : null}
      <span className={"truncate font-black " + (big ? "text-lg" : "text-[15px]")}>{e.name}</span>
      {e.record ? <span className="shrink-0 text-[11px] text-zinc-500 tabular">{e.record}</span> : null}
    </span>
  );
}

function Score({ e, m }: { e: Entrant; m: Match }) {
  if (m.state === "pre") return null;
  if (e.sets.length) return <span className="tabular shrink-0 text-[15px] font-black text-zinc-200">{e.sets.join(" ")}</span>;
  return e.score != null ? <span className="big-num shrink-0 text-xl font-black text-zinc-100">{e.score}</span> : null;
}

/** One head-to-head row: soccer, tennis, MMA, basketball. */
export default function MatchRow({ m, href }: { m: Match; href: string | null }) {
  const time = m.state === "pre" ? new Date(m.start).toLocaleString("en-US", { timeZone: "America/Los_Angeles", weekday: "short", hour: "numeric", minute: "2-digit" }) + " PT" : null;
  return (
    <article className="foil-tile relative p-4">
      {href ? <Link href={href} aria-label={`${m.away.name} vs ${m.home.name}`} className="absolute inset-0 z-0 rounded-2xl" /> : null}
      <div className="flex items-center justify-between gap-2 text-[10px] font-bold uppercase tracking-[0.18em] text-purple-200/80">
        <span className="truncate">{[m.event, m.round].filter(Boolean).join(" · ")}</span>
        {m.state === "in" ? <span className="pill pill-win shrink-0">Live{m.clock && m.clock !== "0'" ? ` ${m.clock}` : ""}</span> : m.state === "post" ? <span className="pill pill-push shrink-0">Final</span> : <span className="shrink-0 normal-case tracking-normal text-zinc-400">{time}</span>}
      </div>
      <div className="mt-2 space-y-1.5">
        <div className="flex items-center justify-between gap-2"><Who e={m.away} /><Score e={m.away} m={m} /></div>
        <div className="flex items-center justify-between gap-2"><Who e={m.home} /><Score e={m.home} m={m} /></div>
      </div>
      {m.state === "in" && m.detail ? <p className="mt-1 text-[11px] text-zinc-400">{m.detail}</p> : null}
      {m.win ? <WinBar win={m.win} away={m.away.short} home={m.home.short} awayColor={m.away.color} awayAlt={m.away.alt} homeColor={m.home.color} compact /> : null}
      {m.price ? (
        <p className="mt-2 text-[11px] text-zinc-400">
          {m.price.awayMl || m.price.homeMl ? (
            <>
              Moneyline <span className="tabular text-zinc-200">{m.away.short} <OddsText value={m.price.awayMl} />{m.price.drawMl ? <> · Draw <OddsText value={m.price.drawMl} /></> : null} · {m.home.short} <OddsText value={m.price.homeMl} /></span>
            </>
          ) : null}
          {m.price.spread ? <> · Spread <span className="tabular text-zinc-200">{m.price.spread}</span></> : null}
          {m.price.total != null ? <> · Total <span className="tabular text-zinc-200">{m.price.total}</span></> : null}
          <span className="ml-1 uppercase tracking-wider text-zinc-500">{m.price.provider}</span>
        </p>
      ) : null}
    </article>
  );
}
