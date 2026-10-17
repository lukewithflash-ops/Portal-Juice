import GameTile from "@/components/GameTile";
import { NEXT_EMPTY } from "@/lib/nextSlate";
import type { Game } from "@/lib/slate";

/** Above today's finals once they are all done: the next slate with a real number, or a plain note. */
export default function NextSlate({ label, games }: { label: string | null; games: Game[] }) {
  return (
    <section className="mb-6" aria-label="Next slate" data-testid="next-slate">
      <h2 className="text-xs font-bold uppercase tracking-[0.22em] text-purple-200/80">
        Next slate{label ? <span className="text-zinc-500"> · {label}</span> : null}
      </h2>
      {games.length ? (
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {games.map((g) => (
            <GameTile key={`next-${g.id}`} game={g} />
          ))}
        </div>
      ) : (
        <p className="panel mt-3 rounded-xl px-4 py-5 text-sm text-zinc-400" data-testid="next-empty">
          {NEXT_EMPTY}
        </p>
      )}
      <p className="mt-6 text-xs font-bold uppercase tracking-[0.22em] text-zinc-500">Today’s finals</p>
    </section>
  );
}
