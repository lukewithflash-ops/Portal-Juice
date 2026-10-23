"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useLiveHub } from "@/components/LiveHub";
import { haptic } from "@/lib/native";
import { SECTIONS, sectionOf, type SectionId } from "@/lib/nav";

const ICON: Record<SectionId, React.ReactNode> = {
  home: <path d="M4 11.5 12 5l8 6.5V19a1 1 0 0 1-1 1h-4.5v-5h-5v5H5a1 1 0 0 1-1-1z" />,
  live: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M6.3 6.3a8 8 0 0 0 0 11.4M17.7 6.3a8 8 0 0 1 0 11.4M8.8 8.8a4.5 4.5 0 0 0 0 6.4M15.2 8.8a4.5 4.5 0 0 1 0 6.4" />
    </>
  ),
  log: <path d="M7 4h10a1 1 0 0 1 1 1v15l-3-2-3 2-3-2-3 2V5a1 1 0 0 1 1-1zM9 9h6M9 13h6" />,
  squads: (
    <>
      <circle cx="9" cy="9" r="3" />
      <circle cx="17" cy="10" r="2.4" />
      <path d="M3.5 19a5.5 5.5 0 0 1 11 0M14.5 19a4 4 0 0 1 6 0" />
    </>
  ),
  more: (
    <>
      <circle cx="12" cy="8.5" r="3.5" />
      <path d="M5 20a7 7 0 0 1 14 0" />
    </>
  ),
};

/** iPhone-style tab bar: five sections, safe-area aware, mobile only. */
export default function BottomTabs() {
  const path = usePathname();
  // Light the tapped tab at once; the route catches up (skeleton shows meanwhile).
  const [tap, setTap] = useState<{ id: SectionId; from: string } | null>(null);
  const cur = tap && tap.from === path ? tap.id : sectionOf(path).id;
  const live = useLiveHub().live.length;
  return (
    <nav className="tabbar lg:hidden" aria-label="Sections" data-layer="" data-testid="tabbar">
      {SECTIONS.map((s) => {
        const on = s.id === cur;
        return (
          <Link
            key={s.id}
            href={s.href}

            aria-current={on ? "page" : undefined}
            className={"tab-item " + (on ? "tab-on" : "")}
            data-testid={"tab-" + s.id}
            onClick={() => {
              if (s.id !== cur) setTap({ id: s.id, from: path });
              haptic("light", 8);
            }}
          >
            <span className="relative">
              <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                {ICON[s.id]}
              </svg>
              {s.id === "live" && live > 0 ? <span className="tab-badge tabular" aria-label={`${live} live`}>{live}</span> : null}
            </span>
            <span className="text-[10px] font-semibold">{s.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
