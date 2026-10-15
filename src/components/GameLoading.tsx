/** Instant tap feedback while a game page renders on the server. Static under reduced motion. */
export default function GameLoading() {
  return (
    <div aria-busy="true" aria-label="Loading game">
      <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.16em] text-purple-200/80">Games</p>
      <div className="h-10 w-48 animate-pulse rounded-lg bg-white/10" />
      <div className="mt-2 h-4 w-64 animate-pulse rounded bg-white/5" />
      <div className="tv-hero mt-5 flex items-center justify-center" style={{ minHeight: "32svh" }}>
        <span className="portal-ring" aria-hidden style={{ width: "3rem", height: "3rem" }} />
      </div>
    </div>
  );
}
