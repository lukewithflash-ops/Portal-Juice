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
      <div className="mx-auto max-w-6xl px-4 pt-2.5">
        <div className="flex items-center gap-4">
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
        </div>
        <nav aria-label="Portal Juice" className="-mx-4 mt-1 flex items-center gap-1 overflow-x-auto px-4 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {NAV.map((n) => {
            const active =
              n.href === "/lines" ? path === "/lines" : path === n.href || path.startsWith(`${n.href}/`);
            return (
              <Link
                key={n.href}
                href={n.href}
                aria-current={active ? "page" : undefined}
                className={`shrink-0 rounded-lg px-2.5 py-1.5 text-[13px] font-semibold transition-colors ${
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
