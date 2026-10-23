"use client";

import { useEffect } from "react";
import { itemOf } from "@/lib/coinsCore";

/** Applies the equipped home theme. Does nothing unless the coins flag is on server-side. */
export function applyTheme(id: string | undefined) {
  const t = id ? itemOf(id) : null;
  const r = document.documentElement;
  if (!t?.look || t.id === "t-void") {
    r.removeAttribute("data-pj-theme");
    r.removeAttribute("data-pj-head");
    for (const v of ["--void-bg", "--neon-purple", "--portal-green", "--th-glow"]) r.style.removeProperty(v);
    return;
  }
  r.setAttribute("data-pj-theme", t.id);
  r.setAttribute("data-pj-head", t.look.header);
  r.style.setProperty("--void-bg", t.look.bg);
  r.style.setProperty("--neon-purple", t.look.accent);
  r.style.setProperty("--portal-green", t.look.accent2);
  r.style.setProperty("--th-glow", t.look.glow);
}

export default function ThemeApply() {
  useEffect(() => {
    const load = () =>
      fetch("/api/coins", { cache: "no-store" })
        .then((r) => r.json())
        .then((j) => j.enabled && j.look && applyTheme(j.look.theme))
        .catch(() => {});
    load();
    window.addEventListener("pj-look", load);
    return () => window.removeEventListener("pj-look", load);
  }, []);
  return null;
}
