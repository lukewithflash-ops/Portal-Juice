/** Instant tap feedback while a game page renders on the server. Static under reduced motion. */
export default function GameLoading() {
  return (
    <div aria-busy="true" aria-label="Loading game" data-testid="skeleton">
      <div className="skel h-10 w-48" />
      <div className="skel mt-2 h-4 w-64" />
      <div className="skel mt-5" style={{ minHeight: "32svh" }} />
      <div className="mt-3 grid grid-cols-2 gap-2">
        <div className="skel h-20" />
        <div className="skel h-20" />
      </div>
    </div>
  );
}
