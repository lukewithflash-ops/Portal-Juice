import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import MatchRow from "@/components/MatchRow";
import AutoRefresh from "@/components/AutoRefresh";
import { sportLeague } from "@/lib/sports";
import { getMatch } from "@/lib/sportsFetch";

export const revalidate = 10;

type Params = { league: string; id: string };

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { league, id } = await params;
  const page = await getMatch(league, id).catch(() => null);
  return { title: page ? `${page.match.away.name} vs ${page.match.home.name}` : "Match" };
}

export default async function MatchPage({ params }: { params: Promise<Params> }) {
  const { league, id } = await params;
  const l = sportLeague(league);
  if (!l) notFound();
  const page = await getMatch(league, id).catch(() => null);
  if (!page) notFound();
  const { match: m, feed, stats } = page;
  return (
    <>
      <p className="mb-3 text-[11px]">
        <Link href="/games" className="font-bold uppercase tracking-[0.16em] text-purple-200/80 hover:text-white">
          Games · {l.name}
        </Link>
      </p>
      <h1 className="big-num text-[2rem] font-black leading-tight tracking-tight text-[color:var(--flat)]">
        {m.away.short} <span className="text-zinc-500">{l.kind === "team" || l.kind === "soccer" ? "@" : "vs"}</span> {m.home.short}
      </h1>
      <p className="mt-1 mb-4 text-sm text-zinc-400">
        {l.name}
        {m.state === "in" ? " · Live" : m.state === "post" ? " · Final" : ""}
      </p>
      {m.state === "in" ? <AutoRefresh ms={5000} /> : null}
      <div className="max-w-xl">
        <MatchRow m={m} href={null} />
        {stats.length ? (
          <section className="foil-tile mt-4 p-4">
            <h2 className="text-[11px] font-black uppercase tracking-[0.2em] text-purple-200/80">{m.state === "pre" ? "Season stats" : "Match stats"}</h2>
            <table className="mt-2 w-full text-[13px]">
              <thead>
                <tr className="text-[10px] uppercase tracking-wider text-zinc-500">
                  <th className="text-left">{m.away.short}</th>
                  <th />
                  <th className="text-right">{m.home.short}</th>
                </tr>
              </thead>
              <tbody>
                {stats.map((s) => (
                  <tr key={s.label} className="border-t border-white/5">
                    <td className="py-1 tabular font-bold text-zinc-100">{s.away}</td>
                    <td className="text-center text-zinc-400">{s.label}</td>
                    <td className="text-right tabular font-bold text-zinc-100">{s.home}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ) : null}
        {feed.length ? (
          <section className="foil-tile mt-4 p-4">
            <h2 className="text-[11px] font-black uppercase tracking-[0.2em] text-purple-200/80">{l.kind === "soccer" ? "Key moments" : "Play by play"}</h2>
            <ol className="mt-2 space-y-1.5 text-[13px]">
              {feed.map((e) => (
                <li key={e.id} className="flex gap-2">
                  <span className="w-12 shrink-0 tabular text-zinc-500">{e.clock ?? ""}</span>
                  <span className={/goal/.test(e.kind) ? "font-black tone-gold" : /red/.test(e.kind) ? "font-bold text-[color:var(--minus)]" : "text-zinc-200"}>{e.text}</span>
                </li>
              ))}
            </ol>
          </section>
        ) : (
          <p className="mt-4 text-sm text-zinc-500">
            {l.kind === "tennis" || l.kind === "fight" ? "ESPN posts the score for this match, not a play feed." : m.state === "pre" ? "The feed starts when the match does." : "No play feed from ESPN for this one."}
          </p>
        )}
      </div>
    </>
  );
}
