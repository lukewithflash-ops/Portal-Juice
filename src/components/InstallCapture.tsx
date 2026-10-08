"use client";

import { useEffect } from "react";

export type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

declare global {
  interface Window {
    __pjPrompt?: InstallPromptEvent;
  }
}

/** Captures the browser install prompt and registers a tiny service worker. */
export default function InstallCapture() {
  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      window.__pjPrompt = e as InstallPromptEvent;
      window.dispatchEvent(new Event("pj-install-ready"));
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);
  return null;
}
