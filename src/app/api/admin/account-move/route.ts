import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { redis } from "@/lib/chat";
import { getUser, startLink } from "@/lib/auth";
import { pushChanges, readDoc } from "@/lib/cloud";
import { LIST_COLS, type SyncPush } from "@/lib/syncCore";
import { getVipSub } from "@/lib/vipAccess";

export const dynamic = "force-dynamic";

function authed(req: Request): boolean {
  const want = process.env.PJ_ADMIN_SECRET || "";
  const got = (req.headers.get("authorization") || "").replace(/^Bearer /, "");
  if (want.length < 24 || got.length !== want.length) return false;
  return timingSafeEqual(Buffer.from(got), Buffer.from(want));
}

async function summary(uid: string) {
  const u = await getUser(uid).catch(() => null);
  const doc = await readDoc(uid);
  const picks = Object.values(doc.cols.picks?.items ?? {}) as Record<string, unknown>[];
  const tally: Record<string, number> = {};
  for (const p of picks) {
    const v = (p.v ?? p) as Record<string, unknown>;
    const r = String(v.status ?? "open");
    tally[r] = (tally[r] ?? 0) + 1;
  }
  const prof = (await redis(["GET", `pj:prof:${uid}`])) as string | null;
  const squads = ((await redis(["SMEMBERS", `pj:usq:${uid}`])) as string[] | null) ?? [];
  const sess = ((await redis(["SMEMBERS", `pj:auth:usess:${uid}`])) as string[] | null) ?? [];
  const vip = await getVipSub(uid);
  return {
    uid, exists: !!u, createdAt: u?.createdAt ?? null, providers: u?.providers ?? null, profile: prof ? JSON.parse(prof) : null,
    picks: picks.length, tally, notes: Object.keys(doc.cols.notes?.items ?? {}).length, follows: Object.keys(doc.cols.follows?.items ?? {}).length,
    singles: Object.keys(doc.singles ?? {}), squads: squads.length, sessions: sess.length, vip: vip ? { source: vip.source, status: (vip as { status?: string }).status ?? null } : null,
  };
}

/**
 * Owner-only.
 * op "inspect": { uids?, since? } summaries, plus every account created at/after `since` (ISO).
 * op "throw": { from, into } copy from's cloud data into `into` and repoint all of from's sessions at `into`.
 *   Nothing is deleted; the old account stays until verified.
 */
export async function POST(req: Request) {
  if (!authed(req)) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const b = (await req.json().catch(() => ({}))) as { op?: string; uids?: string[]; since?: string; from?: string; into?: string };
  if (b.op === "inspect") {
    const out: Record<string, unknown> = {};
    for (const id of b.uids ?? []) out[id] = await summary(id);
    const recent: unknown[] = [];
    if (b.since) {
      const t0 = Date.parse(b.since);
      let cur = "0";
      do {
        const [next, keys] = (await redis(["SCAN", cur, "MATCH", "pj:auth:user:*", "COUNT", 500])) as [string, string[]];
        cur = next;
        for (const k of keys) {
          const raw = (await redis(["GET", k])) as string | null;
          try {
            const u = raw ? JSON.parse(raw) : null;
            if (u && Date.parse(u.createdAt) >= t0) recent.push(await summary(u.id));
          } catch {}
        }
      } while (cur !== "0");
    }
    return NextResponse.json({ out, recent }, { headers: { "cache-control": "no-store" } });
  }
  if (b.op === "throw" && b.from && b.into && b.from !== b.into) {
    if (!(await getUser(b.from)) || !(await getUser(b.into))) return NextResponse.json({ error: "missing account" }, { status: 400 });
    const src = await readDoc(b.from);
    const push: SyncPush = { cols: {}, singles: {} };
    let items = 0;
    for (const col of LIST_COLS) {
      const put = { ...(src.cols[col]?.items ?? {}) };
      items += Object.keys(put).length;
      push.cols[col] = { put, del: {} };
    }
    if (items) await pushChanges(b.into, push);
    const sess = ((await redis(["SMEMBERS", `pj:auth:usess:${b.from}`])) as string[] | null) ?? [];
    let moved = 0;
    for (const h of sess) {
      const ttl = Number(await redis(["TTL", `pj:auth:sess:${h}`]));
      if (ttl <= 0) continue;
      await redis(["SET", `pj:auth:sess:${h}`, b.into, "EX", ttl]);
      await redis(["SADD", `pj:auth:usess:${b.into}`, h]);
      await redis(["SREM", `pj:auth:usess:${b.from}`, h]);
      moved++;
    }
    return NextResponse.json({ items, sessionsMoved: moved, from: await summary(b.from), into: await summary(b.into) });
  }
  if (b.op === "link" && b.into && (await getUser(b.into))) {
    const code = await startLink(b.into);
    return NextResponse.json({ code, expiresAt: new Date(Date.now() + 600_000).toISOString() });
  }
  return NextResponse.json({ error: "bad op" }, { status: 400 });
}
