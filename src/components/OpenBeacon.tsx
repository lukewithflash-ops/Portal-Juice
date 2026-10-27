"use client";
import { useEffect } from "react";

/** Counts one app open per device per day for the owner dashboard. Random id, no personal data. */
export default function OpenBeacon() {
  useEffect(() => {
    try {
      const day = new Date().toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });
      if (localStorage.getItem("pj-open-day") === day) return;
      let d = localStorage.getItem("pj-dev-id");
      if (!d) { d = Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => b.toString(16).padStart(2, "0")).join(""); localStorage.setItem("pj-dev-id", d); }
      fetch("/api/m/open", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ d }), keepalive: true })
        .then((r) => { if (r.ok) localStorage.setItem("pj-open-day", day); })
        .catch(() => {});
    } catch {}
  }, []);
  return null;
}
