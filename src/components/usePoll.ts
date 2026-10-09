"use client";

import { useEffect, useRef } from "react";

/** Live game: every 2.5s (the edge shares one copy per 2s). Before start: 30s. Final: 60s. */
export const POLL_LIVE_MS = 2_500;
export const POLL_PRE_MS = 30_000;
export const POLL_FINAL_MS = 60_000;
export const POLL_ERROR_MS = 10_000;

export function pollDelay(state: "pre" | "in" | "post" | null | undefined): number {
  if (state === "in") return POLL_LIVE_MS;
  if (state === "post") return POLL_FINAL_MS;
  return POLL_PRE_MS;
}

/**
 * Run `pull` now, then again after the delay it returns. Stops while the tab is hidden
 * and pulls right away when it comes back. Never overlaps two pulls.
 */
export function usePoll(pull: (signal: AbortSignal) => Promise<number>, key: string) {
  const ref = useRef(pull);
  useEffect(() => {
    ref.current = pull;
  });

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let running = false;
    let dead = false;
    let ctrl: AbortController | null = null;
    const hidden = () => document.visibilityState === "hidden";

    const clear = () => {
      if (timer) clearTimeout(timer);
      timer = null;
    };
    const run = async () => {
      clear();
      if (dead || running || hidden()) return;
      running = true;
      ctrl = new AbortController();
      let next = POLL_ERROR_MS;
      try {
        next = await ref.current(ctrl.signal);
      } catch {
        next = POLL_ERROR_MS;
      } finally {
        running = false;
      }
      if (dead || hidden()) return;
      clear();
      timer = setTimeout(run, next);
    };
    const onVisible = () => {
      if (hidden()) {
        clear();
        return;
      }
      run();
    };

    run();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      dead = true;
      clear();
      ctrl?.abort();
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [key]);
}
