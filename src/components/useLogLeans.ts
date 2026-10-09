"use client";

import { useEffect, useMemo, useState } from "react";
import { legFromLogged, type LegReport } from "@/lib/breakdown";
import type { Pick } from "@/lib/types";

export type PickLook = { lean: LegReport["lean"]; mark: LegReport["mark"] | null; sub: string };

const CACHE = "pj-log-looks-v1";
const MAX = 12;

function readCache(): Record<string, PickLook> {
  try {
    return JSON.parse(sessionStorage.getItem(CACHE) ?? "{}") ?? {};
  } catch {
    return {};
  }
}

/**
 * Breakdown lean and face/logo for logged picks tied to a game.
 * Open picks first, then the newest settled. One request per six legs; cached for the session.
 */
export function useLogLooks(picks: Pick[]): Record<string, PickLook> {
  const [looks, setLooks] = useState<Record<string, PickLook>>({});
  const want = useMemo(() => {
    const tied = picks.filter((p) => p.league && p.gameId);
    const open = tied.filter((p) => p.status === "open");
    const done = tied.filter((p) => p.status !== "open");
    return [...open, ...done].slice(0, MAX);
  }, [picks]);
  const sig = want.map((p) => `${p.id}:${p.status}:${p.line}`).join("|");

  useEffect(() => {
    let dead = false;
    const cached = readCache();
    const missing = want.filter((p) => !cached[`${p.id}:${p.status}:${p.line}`]);
    const fromCache = () => {
      const out: Record<string, PickLook> = {};
      for (const p of want) {
        const hit = cached[`${p.id}:${p.status}:${p.line}`];
        if (hit) out[p.id] = hit;
      }
      return out;
    };
    // Cached looks show right away; the rest arrive with the response.
    Promise.resolve().then(() => !dead && setLooks(fromCache()));
    const batches: Pick[][] = [];
    const legs = missing.map((p) => ({ p, leg: legFromLogged(p) })).filter((x) => x.leg);
    for (let i = 0; i < legs.length; i += 6) batches.push(legs.slice(i, i + 6).map((x) => x.p));
    for (const batch of batches) {
      fetch("/api/check", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ legs: batch.map((p) => legFromLogged(p)) }),
      })
        .then((r) => (r.ok ? r.json() : null))
        .then((d: { reports?: (LegReport | { error: string })[] } | null) => {
          if (dead || !d?.reports) return;
          d.reports.forEach((r, i) => {
            const p = batch[i];
            if (!p || "error" in r) return;
            cached[`${p.id}:${p.status}:${p.line}`] = { lean: r.lean, mark: r.mark ?? null, sub: r.sub };
          });
          try {
            sessionStorage.setItem(CACHE, JSON.stringify(cached));
          } catch {
            /* full */
          }
          setLooks(fromCache());
        })
        .catch(() => {});
    }
    return () => {
      dead = true;
    };
    // sig covers want.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig]);

  return looks;
}
