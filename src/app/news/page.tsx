import type { Metadata } from "next";
import PageHeader from "@/components/PageHeader";
import { getStories } from "@/lib/espn";
import { ptDayTime } from "@/lib/time";

export const revalidate = 60;

export const metadata: Metadata = {
  title: "News",
  description: "Sports headlines from ESPN. Portal Juice does not write the stories.",
};

export default async function NewsPage() {
  const { stories, fetchedAt } = await getStories();
  return (
    <>
      <PageHeader title="News" sub={<>ESPN headlines · {ptDayTime(fetchedAt)}</>} />
      {stories.length === 0 ? (
        <p className="panel rounded-xl px-4 py-5 text-sm text-zinc-400">No headlines from ESPN right now.</p>
      ) : (
        <ul className="space-y-3">
          {stories.map((s) => (
            <li key={s.id} className="foil-tile p-4">
              <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-purple-200/80">
                {s.source} · {s.league}
                {s.published ? ` · ${ptDayTime(s.published)}` : ""}
              </div>
              <a href={s.url} className="mt-1 block text-base font-bold leading-snug text-[color:var(--flat)] hover:text-white" rel="noreferrer">
                {s.headline}
              </a>
              {s.description && <p className="mt-1 text-sm text-zinc-400">{s.description}</p>}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
