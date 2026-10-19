import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { focusSession, isRacing, nextRace, raceHref, RACING, racingLeague } from "@/lib/racing";
import { getRacingHome } from "@/lib/racingFetch";
import { ptDayTime } from "@/lib/time";

export const revalidate = 120;

export async function generateMetadata({ params }: { params: Promise<{ league: string }> }): Promise<Metadata> {
  const { league } = await params;
  return { title: `${racingLeague(league)?.name ?? "Racing"} schedule` };
}

/** One series: next race, the season schedule in PT with winners, and the championship top 10. */
export default async function RacingLeague({ params }: { params: Promise<{ league: string }> }) {
  const { league } = await params;
  if (!isRacing(league)) redirect("/games");
  const l = racingLeague(league)!;
  const { season, standings } = await getRacingHome(league).catch(() => ({ season: [], standings: [] }));
  const next = nextRace(season);
  const done = season.filter((e) => e.state === "post");
  const last = done[done.length - 1] ?? null;
  return (
    <div className="max-w-2xl">
      <nav className="mb-3 flex gap-1.5 overflow-x-auto pb-1" aria-label="Series">
        {RACING.map((r) => (
          <Link key={r.id} href={`/racing/${r.id}`} aria-pressed={r.id === league} className={"shrink-0 rounded-full border px-3 py-1 text-[12px] font-black " + (r.id === league ? "border-[color:var(--plus)] text-white" : "border-white/15 text-zinc-400")}>
            {r.label}
          </Link>
        ))}
      </nav>
      <h1 className="big-num text-[2rem] font-black leading-tight text-[color:var(--flat)]">{l.name}</h1>
      {!season.length ? <p className="mt-3 text-sm text-zinc-400">ESPN&apos;s {l.name} schedule didn&apos;t load. Try again in a minute.</p> : null}
      {next ? (
        <Link href={raceHref(league, next.id)} className="foil-tile mt-4 block p-4" data-testid="next-race">
          <p className="text-[11px] font-black uppercase tracking-[0.2em] text-purple-200/80">{next.state === "in" ? "Live now" : next.state === "post" ? "Latest" : "Next race"}</p>
          <p className="mt-1 text-lg font-black text-white">{next.name}</p>
          <p className="text-[12px] text-zinc-400">{[next.circuit, next.city].filter(Boolean).join(" · ")}</p>
          <ul className="mt-2 space-y-0.5 text-[12px] text-zinc-300">
            {next.sessions.map((s) => (
              <li key={s.id} className="flex justify-between gap-2">
                <span>{s.label}</span>
                <span className="tabular">{s.state === "post" ? `Done · P1 ${s.finishers[0]?.short ?? "—"}` : s.state === "in" ? "Live" : ptDayTime(s.date)}</span>
              </li>
            ))}
          </ul>
        </Link>
      ) : null}
      {last && last.id !== next?.id ? (
        <Link href={raceHref(league, last.id)} className="foil-tile mt-4 block p-4">
          <p className="text-[11px] font-black uppercase tracking-[0.2em] text-purple-200/80">Last result</p>
          <p className="mt-1 font-black text-white">{last.name}</p>
          <ol className="mt-1 text-[13px] text-zinc-300">
            {(focusSession(last)?.finishers ?? []).slice(0, 5).map((f) => (
              <li key={f.id}>
                <span className="tabular mr-2 text-zinc-500">P{f.pos}</span>
                {f.name}
              </li>
            ))}
          </ol>
        </Link>
      ) : null}
      {standings.length ? (
        <section className="foil-tile mt-4 p-4">
          <h2 className="text-[11px] font-black uppercase tracking-[0.2em] text-purple-200/80">Championship</h2>
          <ol className="mt-2 space-y-0.5 text-[13px]">
            {standings.slice(0, 10).map((s) => (
              <li key={s.id} className="flex justify-between">
                <span>
                  <span className="tabular mr-2 text-zinc-500">{s.rank}</span>
                  {s.name}
                </span>
                <span className="tabular text-zinc-300">{s.points ?? "—"}</span>
              </li>
            ))}
          </ol>
        </section>
      ) : null}
      {season.length ? (
        <section className="foil-tile mt-4 p-4" aria-label="Schedule">
          <h2 className="text-[11px] font-black uppercase tracking-[0.2em] text-purple-200/80">Schedule · times PT</h2>
          <ul className="mt-2 divide-y divide-white/5 text-[13px]">
            {season.map((e) => {
              const w = e.state === "post" ? focusSession(e)?.finishers[0] : null;
              return (
                <li key={e.id}>
                  <Link href={raceHref(league, e.id)} className="flex items-center justify-between gap-2 py-1.5">
                    <span className="min-w-0 truncate font-semibold text-zinc-100">{e.short}</span>
                    <span className="tabular shrink-0 text-[11px] text-zinc-400">{e.state === "in" ? "Live" : w ? `🏁 ${w.short}` : ptDayTime(e.date)}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
