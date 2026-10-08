import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTeam } from "@/lib/espn";
import { leagueById } from "@/lib/slate";
import { ptDayTime } from "@/lib/time";

export const revalidate = 60;

type Params = { league: string; team: string };

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { league, team } = await params;
  const page = await getTeam(league, team);
  if (!page) return { title: "Team" };
  return {
    title: page.name,
    description: `${page.name}${page.record ? `, ${page.record}` : ""}. ${page.leagueLabel}. Lines and prices only.`,
  };
}

export default async function TeamPage({ params }: { params: Promise<Params> }) {
  const { league, team } = await params;
  if (!leagueById(league)) notFound();
  const page = await getTeam(league, team);
  if (!page) notFound();
  return (
    <>
      <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-purple-200/80">
        <Link href="/games" className="hover:text-white">{page.leagueLabel}</Link>
      </p>
      <div className="mt-2 flex items-center gap-3">
        {page.logo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={page.logo} alt="" width={56} height={56} className="h-14 w-14 object-contain" />
        ) : null}
        <div>
          <h1 className="text-2xl font-black tracking-tight text-[color:var(--flat)] sm:text-3xl">{page.name}</h1>
          <p className="text-sm text-zinc-400">
            {page.record ? <span className="tabular text-[color:var(--flat)]">{page.record}</span> : "No record posted"}
            {page.standing ? ` · ${page.standing}` : ""}
          </p>
        </div>
      </div>

      <section className="mt-6 foil-tile p-4">
        <h2 className="text-xs font-bold uppercase tracking-[0.18em] text-purple-200/80">Next</h2>
        {page.next ? (
          <p className="mt-2 text-sm text-[color:var(--flat)]">
            {page.next.label}
            <span className="ml-2 text-zinc-400">{ptDayTime(page.next.start)}</span>
          </p>
        ) : (
          <p className="mt-2 text-sm text-zinc-400">No next game posted.</p>
        )}
      </section>

      <section className="mt-4">
        <h2 className="mb-2 text-xs font-bold uppercase tracking-[0.18em] text-purple-200/80">Recent</h2>
        {page.recent.length === 0 ? (
          <p className="panel rounded-xl px-4 py-4 text-sm text-zinc-400">No final scores posted on the schedule.</p>
        ) : (
          <ul className="space-y-2">
            {page.recent.map((g) => (
              <li key={g.start + g.label} className="foil-tile flex items-center justify-between gap-3 px-3 py-2.5 text-sm">
                <span className="text-[color:var(--flat)]">{g.label}</span>
                <span className="tabular text-zinc-300">{g.score}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-6">
        <h2 className="mb-2 text-xs font-bold uppercase tracking-[0.18em] text-purple-200/80">News</h2>
        {page.stories.length === 0 ? (
          <p className="panel rounded-xl px-4 py-4 text-sm text-zinc-400">No stories from ESPN for this team.</p>
        ) : (
          <ul className="space-y-2">
            {page.stories.map((s) => (
              <li key={s.id} className="foil-tile p-3">
                <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                  {s.source}{s.published ? ` · ${ptDayTime(s.published)}` : ""}
                </div>
                <a href={s.url} className="mt-1 block text-sm font-bold text-[color:var(--flat)] hover:text-white" rel="noreferrer">
                  {s.headline}
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
