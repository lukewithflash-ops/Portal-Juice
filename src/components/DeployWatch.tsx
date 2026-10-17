"use client";

import { useEffect } from "react";

const MINE = process.env.NEXT_PUBLIC_BUILD_ID ?? "";
const EVERY_MS = 5 * 60_000;

/**
 * An installed iPhone app can stay open for days on an old build, and a cold launch can come back
 * from the page cache. On launch, when the app comes back to the foreground, after you stop typing,
 * and every 5 minutes, it asks which deploy is live and moves onto it with a cache-busting load.
 * One try per build per minute, so a slow edge never loops.
 */
export default function DeployWatch() {
  useEffect(() => {
    if (!MINE) return;
    let last = 0;
    let pending: string | null = null;
    const typing = () => {
      const el = document.activeElement as HTMLElement | null;
      return !!el && (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.isContentEditable);
    };
    const go = (build: string) => {
      if (typing() || document.querySelector('[role="dialog"],[role="alertdialog"]')) {
        pending = build;
        return;
      }
      try {
        const key = "pj-reload-to";
        const prev = JSON.parse(sessionStorage.getItem(key) || "null") as { b: string; t: number } | null;
        if (prev && prev.b === build && Date.now() - prev.t < 60_000) return;
        sessionStorage.setItem(key, JSON.stringify({ b: build, t: Date.now() }));
      } catch {
        /* private mode */
      }
      navigator.serviceWorker?.getRegistration().then((reg) => reg?.update()).catch(() => {});
      const u = new URL(window.location.href);
      u.searchParams.set("v", build.slice(0, 7));
      window.location.replace(u.toString());
    };
    const check = async (force = false) => {
      if (!force && Date.now() - last < 15_000) return;
      last = Date.now();
      try {
        const r = await fetch(`/api/version?t=${Date.now()}`, { cache: "no-store" });
        const { build } = (await r.json()) as { build: string | null };
        if (!build || build === MINE) return;
        go(build);
      } catch {
        /* offline: try next time */
      }
    };
    // Clean the ?v= marker off the address once we are on the new build.
    try {
      const u = new URL(window.location.href);
      if (u.searchParams.has("v") && /^[0-9a-f]{7}$/.test(u.searchParams.get("v") ?? "")) {
        u.searchParams.delete("v");
        window.history.replaceState(window.history.state, "", u.pathname + (u.search || "") + u.hash);
      }
    } catch {
      /* ignore */
    }
    void check(true);
    const onShow = () => {
      if (document.visibilityState === "visible") void check(true);
    };
    const onBlur = () => {
      if (pending) setTimeout(() => pending && go(pending), 1500);
    };
    document.addEventListener("visibilitychange", onShow);
    window.addEventListener("pageshow", onShow);
    window.addEventListener("focus", onShow);
    document.addEventListener("focusout", onBlur);
    document.addEventListener("click", onBlur);
    const t = setInterval(() => {
      if (document.visibilityState === "visible") void check();
    }, EVERY_MS);
    return () => {
      document.removeEventListener("visibilitychange", onShow);
      window.removeEventListener("pageshow", onShow);
      window.removeEventListener("focus", onShow);
      document.removeEventListener("focusout", onBlur);
      document.removeEventListener("click", onBlur);
      clearInterval(t);
    };
  }, []);
  return null;
}
