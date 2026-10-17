"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { sectionOf } from "@/lib/nav";

/** A quick neon ring opens over each page change. CSS hides it under reduced motion. */
export default function PortalWipe() {
  const path = usePathname();
  const last = useRef(path);
  const count = useRef(0);
  const [wipe, setWipe] = useState<number | null>(null);
  useEffect(() => {
    if (last.current === path) return;
    // Sub-tab switches stay instant; the ring only opens when you jump to another section.
    const same = sectionOf(last.current).id === sectionOf(path).id;
    last.current = path;
    if (same) return;
    count.current += 1;
    const n = count.current;
    const a = requestAnimationFrame(() => setWipe(n));
    const t = setTimeout(() => setWipe((w) => (w === n ? null : w)), 600);
    return () => {
      cancelAnimationFrame(a);
      clearTimeout(t);
    };
  }, [path]);
  if (wipe === null) return null;
  return (
    <div key={wipe} className="portal-wipe" aria-hidden>
      <span className="portal-wipe-ring" />
    </div>
  );
}
