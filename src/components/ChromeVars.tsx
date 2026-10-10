"use client";

import { useLayoutEffect } from "react";

/**
 * Measures the sticky top stack (nav + live banner + page bars) and sets --chrome-h on <html>, so sticky bars sit flush under it.
 * The header height already includes the iPhone safe area (its padding-top).
 */
export default function ChromeVars() {
  useLayoutEffect(() => {
    const root = document.documentElement;
    const chrome = document.querySelector(".top-stack");
    if (!chrome) return;
    const set = () => root.style.setProperty("--chrome-h", Math.round(chrome.getBoundingClientRect().height) + "px");
    set();
    const ro = new ResizeObserver(set);
    ro.observe(chrome);
    window.addEventListener("resize", set);
    window.visualViewport?.addEventListener("resize", set);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", set);
      window.visualViewport?.removeEventListener("resize", set);
    };
  }, []);
  return null;
}
