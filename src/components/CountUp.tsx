"use client";

import { useEffect, useRef, useState } from "react";
import { fmtLine, fmtOdds } from "@/lib/odds";

export type NumFormat =
  | "line"
  | "signedLine"
  | "odds"
  | "pct"
  | "int";

function format(n: number, kind: NumFormat, decimals: number): string {
  switch (kind) {
    case "line":
      return fmtLine(Number(n.toFixed(decimals)), false);
    case "signedLine":
      return fmtLine(Number(n.toFixed(decimals)), true);
    case "odds":
      return fmtOdds(Math.round(n));
    case "pct":
      return `${Math.round(n)}%`;
    case "int":
      return String(Math.round(n));
  }
}

function decimalsFor(v: number, kind: NumFormat) {
  if (kind === "line" || kind === "signedLine") return Number.isInteger(v) ? 0 : 1;
  return 0;
}

/**
 * Counts from 0 on first paint, then from the old value to the new one when
 * the number changes. Motion lives on the number only.
 */
export default function CountUp({
  value,
  kind,
  duration = 750,
  className,
}: {
  value: number;
  kind: NumFormat;
  duration?: number;
  className?: string;
}) {
  const [shown, setShown] = useState(0);
  const fromRef = useRef(0);
  const decimals = decimalsFor(value, kind);

  useEffect(() => {
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const from = fromRef.current;
    // Snap halves so lines read .5 on the way up, not 12.37.
    const step = decimals ? 0.5 : 1;
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = reduce ? 1 : Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      const v = from + (value - from) * eased;
      // Snap halves so lines read .5 on the way up, not 12.37.
      setShown(t >= 1 ? value : Math.round(v / step) * step);
      if (t < 1) raf = requestAnimationFrame(tick);
      else fromRef.current = value;
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      fromRef.current = value;
    };
  }, [value, duration, decimals, kind]);

  return (
    <span className={`tabular ${className ?? ""}`} aria-label={format(value, kind, decimals)}>
      <span aria-hidden>{format(shown, kind, decimals)}</span>
    </span>
  );
}
