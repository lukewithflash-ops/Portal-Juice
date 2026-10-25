import { NextResponse } from "next/server";
import { currentUser, sameOrigin } from "@/lib/auth";
import { isVipUid } from "@/lib/vipAccess";
import { bookSyncAllowed, getState, keysReady, linkUrl, manualRefresh, paused, setPrefs, unlinkAll } from "@/lib/bookSync";
import { BOOKSYNC_COOKIE, MANUAL_REFRESH_PER_DAY } from "@/lib/bookSyncCore";

export const dynamic = "force-dynamic";

/** Status for the More screen. ?booksync=1 / ?booksync=0 sets or clears the test cookie. */
export async function GET(req: Request) {
  const u = await currentUser();
  const q = new URL(req.url).searchParams.get("booksync");
  if (q === "1" || q === "0") {
    const res = NextResponse.redirect(new URL("/more", req.url));
    res.cookies.set(BOOKSYNC_COOKIE, q, { path: "/", httpOnly: true, sameSite: "lax", secure: true, maxAge: q === "1" ? 60 * 60 * 24 * 30 : 0 });
    return res;
  }
  const on = await bookSyncAllowed(u);
  if (!on) return NextResponse.json({ on: false });
  if (!u) return NextResponse.json({ on: true, signedIn: false, ready: keysReady() });
  const [s, vip] = await Promise.all([getState(u.id), isVipUid(u.id).catch(() => false)]);
  return NextResponse.json({
    on: true,
    signedIn: true,
    ready: keysReady(),
    vip,
    consented: !!s.consentAt,
    showPublic: s.showPublic,
    pausedUntil: paused(s) ? s.pausedUntil : null,
    refreshPerDay: MANUAL_REFRESH_PER_DAY,
    books: Object.values(s.accounts).map((a) => ({ id: a.id, book: a.book, status: a.status, lastSync: a.lastSync })),
  });
}

/** Actions: link (needs consent), refresh, unlink, prefs. */
export async function POST(req: Request) {
  if (!(await sameOrigin(req))) return NextResponse.json({ error: "Bad origin" }, { status: 403 });
  const u = await currentUser();
  if (!u) return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  if (!(await bookSyncAllowed(u))) return NextResponse.json({ error: "Not available yet" }, { status: 404 });
  const b = (await req.json().catch(() => ({}))) as { action?: string; consent?: boolean; account?: string; showPublic?: boolean; pauseDays?: number };
  const s = await getState(u.id);
  switch (b.action) {
    case "link": {
      if (b.consent !== true) return NextResponse.json({ error: "Agree to link first" }, { status: 400 });
      if (paused(s)) return NextResponse.json({ error: "Book sync is paused" }, { status: 403 });
      if (!keysReady()) return NextResponse.json({ error: "Book sync is not set up yet" }, { status: 503 });
      try {
        return NextResponse.json({ url: await linkUrl(u.id) });
      } catch {
        return NextResponse.json({ error: "Could not start linking. Try again." }, { status: 502 });
      }
    }
    case "refresh": {
      if (!b.account) return NextResponse.json({ error: "Pick a book" }, { status: 400 });
      const r = await manualRefresh(u.id, b.account);
      if (r.ok) return NextResponse.json({ ok: true });
      const msg = { limit: `You can refresh each book ${MANUAL_REFRESH_PER_DAY} times a day`, paused: "Book sync is paused", relink: "Relink this book first", unknown: "Book not found", error: "Refresh failed. Try later." }[r.reason];
      return NextResponse.json({ error: msg }, { status: r.reason === "limit" ? 429 : 400 });
    }
    case "unlink":
      return NextResponse.json({ ok: true, ...(await unlinkAll(u.id)) });
    case "prefs": {
      const n = await setPrefs(u.id, { showPublic: b.showPublic, pauseDays: b.pauseDays });
      return NextResponse.json({ ok: true, showPublic: n.showPublic, pausedUntil: paused(n) ? n.pausedUntil : null });
    }
  }
  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
