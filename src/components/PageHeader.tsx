/** Compact iOS-style page header: one title line, one short line under it, an optional fine-print line. */
export default function PageHeader({ title, sub, note, right }: { title: React.ReactNode; sub?: React.ReactNode; note?: React.ReactNode; right?: React.ReactNode }) {
  return (
    <header className="mb-4 flex items-end gap-3" data-testid="page-header">
      <div className="min-w-0 flex-1">
        <h1 className="text-[22px] font-bold leading-7 tracking-tight text-white">{title}</h1>
        {sub ? <p className="mt-0.5 text-[13px] leading-5 text-zinc-400">{sub}</p> : null}
        {note ? <p className="mt-1 text-[11px] leading-4 text-zinc-500">{note}</p> : null}
      </div>
      {right ? <div className="shrink-0">{right}</div> : null}
    </header>
  );
}
