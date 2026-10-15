"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

/** A quick neon ring opens over each page change. CSS hides it under reduced motion. */
export default function PortalWipe() {
  const path = usePathname();
  const last = useRef(path);
  const count = useRef(0);
  const [wipe, setWipe] = useState<number | null>(null);
  useEffect(() => {
    if (last.current === path) return;
    last.current = path;
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
