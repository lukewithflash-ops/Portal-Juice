"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { sectionOf, subActive } from "@/lib/nav";

/** Segmented sub-tabs for the current section (Home: Lines · Games · Props…). Hidden when a section has one page. */
export default function SectionTabs() {
  const path = usePathname();
  const s = sectionOf(path);
  const row = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // Keep the active segment in view without moving the page.
    const el = row.current?.querySelector<HTMLElement>('[aria-current="page"]');
    if (el && row.current) row.current.scrollTo({ left: el.offsetLeft - 12, behavior: "instant" as ScrollBehavior });
  }, [path]);
  if (s.subs.length < 2) return null;
  return (
    <div className="seg-wrap" data-testid="section-tabs">
      <div ref={row} className="seg-row mx-auto max-w-6xl" role="tablist" aria-label={s.label}>
        {s.subs.map((t) => {
          const on = subActive(path, t);
          return (
            <Link key={t.href} href={t.href} prefetch role="tab" aria-selected={on} aria-current={on ? "page" : undefined} className={"seg " + (on ? "seg-on" : "")}>
              {t.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
