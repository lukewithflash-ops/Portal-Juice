/** Shimmer placeholders in the shape of the content that is on its way. Static under reduced motion. */
export function SkelRows({ n = 4, h = 64, label = "Loading" }: { n?: number; h?: number; label?: string }) {
  return (
    <div aria-busy="true" aria-label={label} className="space-y-2" data-testid="skeleton">
      {Array.from({ length: n }, (_, i) => (
        <div key={i} className="skel" style={{ height: h }} />
      ))}
    </div>
  );
}

export default function PageSkeleton({ label = "Loading" }: { label?: string }) {
  return (
    <div aria-busy="true" aria-label={label} data-testid="skeleton">
      <div className="skel h-7 w-40" />
      <div className="skel mt-2 h-4 w-60" />
      <div className="mt-5 grid gap-2 sm:grid-cols-2">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="skel h-[84px]" />
        ))}
      </div>
    </div>
  );
}
