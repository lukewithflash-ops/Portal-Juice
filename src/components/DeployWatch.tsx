"use client";

import { useEffect } from "react";

const MINE = process.env.NEXT_PUBLIC_BUILD_ID ?? "";
const EVERY_MS = 10 * 60_000;

/**
 * An installed iPhone app can stay open for days on an old build. When the app comes back to the
 * foreground (or every 10 minutes) it asks which deploy is live and reloads onto it, unless you are typing.
 */
export default function DeployWatch() {
  useEffect(() => {
    if (!MINE) return;
    let last = 0;
    const check = async () => {
      if (Date.now() - last < 30_000) return;
      last = Date.now();
      try {
        const r = await fetch("/api/version", { cache: "no-store" });
        const { build } = (await r.json()) as { build: string | null };
        if (!build || build === MINE) return;
        const el = document.activeElement;
        if (el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) return;
        navigator.serviceWorker?.getRegistration().then((reg) => reg?.update()).catch(() => {});
        window.location.reload();
      } catch {
        /* offline: try next time */
      }
    };
    const onShow = () => {
      if (document.visibilityState === "visible") void check();
    };
    document.addEventListener("visibilitychange", onShow);
    window.addEventListener("pageshow", onShow);
    const t = setInterval(() => {
      if (document.visibilityState === "visible") void check();
    }, EVERY_MS);
    return () => {
      document.removeEventListener("visibilitychange", onShow);
      window.removeEventListener("pageshow", onShow);
      clearInterval(t);
    };
  }, []);
  return null;
}
