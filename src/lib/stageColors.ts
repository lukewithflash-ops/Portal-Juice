import type { LiveSnap } from "@/lib/live";

/** Lift near-black team colors so they read on the dark stage. Same hue, more light. */
export function visible(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  let r = (n >> 16) & 255;
  let g = (n >> 8) & 255;
  let b = n & 255;
  const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  if (lum >= 0.22) return "#" + m[1];
  const k = lum < 0.06 ? 0.72 : 0.45;
  r = Math.round(r + (255 - r) * k);
  g = Math.round(g + (255 - g) * k);
  b = Math.round(b + (255 - b) * k);
  return "#" + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
}

function lum(hex: string): number {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return 0.5;
  const n = parseInt(m[1], 16);
  return (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255;
}

function rgbGap(a: string, b: string): number {
  const p = (h: string) => {
    const n = parseInt(h.replace("#", ""), 16) || 0;
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };
  const [x, y] = [p(a), p(b)];
  return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);
}

/**
 * Team colors for the dark stage. A very dark primary uses ESPN's alternate when that reads better,
 * and two teams that land on near-identical colors split onto the away team's alternate.
 */
export function stageColors(snap: Pick<LiveSnap, "awayColor" | "homeColor" | "awayAlt" | "homeAlt"> | null): [string, string] {
  const pick = (c: string | undefined, alt: string | null | undefined, fb: string) => {
    const base = c || fb;
    if (alt && lum(base) < 0.16 && lum(alt) > 0.2 && lum(alt) < 0.92) return alt;
    return visible(base);
  };
  let away = pick(snap?.awayColor, snap?.awayAlt, "#7c3aed");
  const home = pick(snap?.homeColor, snap?.homeAlt, "#39ff14");
  if (rgbGap(away, home) < 70 && snap?.awayAlt && rgbGap(visible(snap.awayAlt), home) > rgbGap(away, home)) away = visible(snap.awayAlt);
  return [away, home];
}

