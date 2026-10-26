"use client";

import { useEffect } from "react";
import { dedupeCopies } from "@/lib/pickStore";
import { getAccount, localStamp, refreshAccount, syncNow } from "@/lib/syncClient";

/** Runs in the background: picks up the signed-in account and keeps this device and the cloud in step. */
export default function SyncAgent() {
  useEffect(() => {
    try { dedupeCopies(); } catch {}
  }, []);
  useEffect(() => {
    let last = "";
    let timer: ReturnType<typeof setTimeout> | null = null;
    void refreshAccount().then(() => {
      last = localStamp();
    });
    const tick = setInterval(() => {
      // Local edits go up even from a background tab; pulls wait until the app is in view.
      if (!getAccount().user) return;
      const now = localStamp();
      if (now !== last) {
        last = now;
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => void syncNow().then(() => (last = localStamp())), 1200);
      }
    }, 2000);
    // Pull what other devices changed.
    const pull = setInterval(() => {
      if (getAccount().user && document.visibilityState === "visible") void syncNow().then(() => (last = localStamp()));
    }, 15000);
    const onVis = () => {
      if (document.visibilityState === "visible") void refreshAccount().then(() => syncNow()).then(() => (last = localStamp()));
      // Leaving the app: send anything not yet sent.
      else if (getAccount().user && localStamp() !== last) void syncNow().then(() => (last = localStamp()));
    };
    const onOnline = () => void syncNow();
    document.addEventListener("visibilitychange", onVis);
    const onHide = () => {
      if (getAccount().user && localStamp() !== last) void syncNow().then(() => (last = localStamp()));
    };
    window.addEventListener("pagehide", onHide);
    window.addEventListener("online", onOnline);
    return () => {
      clearInterval(tick);
      clearInterval(pull);
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("pagehide", onHide);
      window.removeEventListener("online", onOnline);
    };
  }, []);
  return null;
}
