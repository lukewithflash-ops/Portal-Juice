import Link from "next/link";
import { LeanMeter } from "@/components/CheckClient";
import { checkHref, LEAN_NOTE } from "@/lib/breakdown";
import { chooseLean } from "@/lib/gameLean";
import { researchGame } from "@/lib/research";

/** "Our lean" with the homework behind it. Server-rendered from ESPN numbers only. */
export default async function LeanPanel({ league, id }: { league: string; id: string }) {
  const g = await researchGame(league, id).catch(() => null);
  const lean = chooseLean(g);
  return (
    <section className="foil-tile mt-4 p-4" aria-label="Our lean" data-testid="our-lean">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-[11px] font-black uppercase tracking-[0.2em] text-purple-200/80">Our lean</h2>
        {lean.kind === "lean" ? (
          <Link href={checkHref([lean.leg])} className="text-[12px] font-bold text-purple-200 hover:text-white">
            Full breakdown →
          </Link>
        ) : null}
      </div>
      {lean.kind === "none" ? (
        <>
          <p className="mt-2 text-sm font-semibold text-zinc-300">{lean.reason}</p>
          <p className="mt-1 text-[10px] text-zinc-500">{LEAN_NOTE}</p>
        </>
      ) : (
        <>
          <p className="big-num mt-1 text-2xl font-black text-[color:var(--flat)]">
            {lean.report.title}
            {lean.report.odds != null ? (
              <span className="ml-2 text-base text-zinc-400 tabular">
                at {lean.report.odds > 0 ? `+${lean.report.odds}` : lean.report.odds} · {g?.odds?.provider ?? ""}
              </span>
            ) : null}
          </p>
          <div className="mt-2">
            <LeanMeter r={lean.report} />
          </div>
          <ul className="mt-3 space-y-1.5 text-[13px]">
            {lean.points.map((p, i) => (
              <li key={i} className="flex gap-2">
                <span className={"font-black " + (p.pro ? (p.weight >= 2 ? "tone-gold" : "text-[color:var(--plus)]") : "text-[color:var(--minus)]")}>{p.pro ? "+" : "−"}</span>
                <span className="text-zinc-200">{p.text}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
