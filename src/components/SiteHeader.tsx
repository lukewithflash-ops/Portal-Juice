"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { NAV, SITE_NAME, TAGLINE } from "@/lib/site";

export default function SiteHeader() {
  const path = usePathname();
  const firstPath = useRef(path);
  // Tagline shows on first paint only; it drops after the first in-app navigation.
  const [showTagline, setShowTagline] = useState(true);
  useEffect(() => {
    if (path !== firstPath.current) {
      const id = requestAnimationFrame(() => setShowTagline(false));
      return () => cancelAnimationFrame(id);
    }
  }, [path]);

  return (
    <header className="site-chrome sticky top-0 z-40">
      <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3">
        <Link href="/lines" className="flex items-center gap-2.5" aria-label={`${SITE_NAME} — Lines`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/brand/swirl-mark.png"
            alt=""
            width={44}
            height={37}
            className="h-9 w-auto mix-blend-screen"
            aria-hidden
          />
          <span className="flex flex-col leading-none">
            <span className="wordmark text-lg font-black tracking-tight sm:text-xl">{SITE_NAME}</span>
            {showTagline && (
              <span className="mt-1 text-[10px] font-medium uppercase tracking-[0.22em] text-zinc-400">
                {TAGLINE}
              </span>
            )}
          </span>
        </Link>
        <nav aria-label="Portal Juice" className="ml-auto flex items-center gap-1">
          {NAV.map((n) => {
            const active = path === n.href;
            return (
              <Link
                key={n.href}
                href={n.href}
                aria-current={active ? "page" : undefined}
                className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors ${
                  active
                    ? "bg-purple-500/20 text-white shadow-[inset_0_-2px_0_var(--plus)]"
                    : "text-zinc-400 hover:bg-purple-500/10 hover:text-zinc-100"
                }`}
              >
                {n.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
