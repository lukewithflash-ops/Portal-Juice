"use client";

import { useEffect } from "react";
import { applyGrades, getPicks } from "@/lib/pickStore";
import type { PickStatus } from "@/lib/types";

/** Grades open picks whose game is final, on load and every 2 minutes. Device-only log. */
export function AutoGrade() {
  useEffect(() => {
    let stop = false;
    async function run() {
      const open = getPicks().filter((p) => p.status === "open" && p.gameId && p.league);
      if (!open.length) return;
      try {
        const res = await fetch("/api/grade", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ picks: open }) });
        if (!res.ok || stop) return;
        const j = (await res.json()) as { grades?: Record<string, PickStatus> };
        if (j.grades) applyGrades(j.grades);
      } catch {}
    }
    run();
    const t = setInterval(run, 120_000);
    // Edited picks re-grade right away.
    const now = () => void run();
    window.addEventListener("pj-regrade", now);
    return () => {
      stop = true;
      clearInterval(t);
      window.removeEventListener("pj-regrade", now);
    };
  }, []);
  return null;
}
