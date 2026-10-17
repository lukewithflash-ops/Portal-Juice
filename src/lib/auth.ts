import "server-only";
import { dropSocial } from "@/lib/social";
import { revokeWidgetToken } from "@/lib/widget";
import { createHash, createSign, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { cookies, headers } from "next/headers";
import { chatEnabled, redis } from "@/lib/chat";

/**
 * Accounts on the existing Upstash Redis. No third-party auth service.
 * Sessions: random token in an httpOnly cookie; Redis keeps only its hash.
 * Sign-in: email code / link (needs RESEND_API_KEY + AUTH_EMAIL_FROM), Google (GOOGLE_CLIENT_ID/SECRET),
 * Apple (APPLE_SERVICES_ID, APPLE_TEAM_ID, APPLE_KEY_ID, APPLE_PRIVATE_KEY), a private account with no email,
 * and a one-time code to add another device.
 */

export const SESSION_COOKIE = "pj_sid";
const SESSION_DAYS = 180;
export const SITE = (process.env.NEXT_PUBLIC_SITE_URL || "https://portaljuice.app").replace(/\/$/, "");

export type Provider = "email" | "google" | "apple" | "device";
export type User = { id: string; email: string | null; name: string | null; image: string | null; providers: Provider[]; createdAt: string };

const K = {
  user: (id: string) => `pj:auth:user:${id}`,
  email: (e: string) => `pj:auth:email:${e}`,
  oauth: (p: string, sub: string) => `pj:auth:oauth:${p}:${sub}`,
  sess: (h: string) => `pj:auth:sess:${h}`,
  userSess: (id: string) => `pj:auth:usess:${id}`,
  otp: (e: string) => `pj:auth:otp:${e}`,
  link: (code: string) => `pj:auth:link:${code}`,
  rate: (k: string) => `pj:auth:rate:${k}`,
  push: (id: string) => `pj:auth:push:${id}`,
};

export function authEnabled() {
  return chatEnabled();
}
export function providersReady() {
  return {
    store: chatEnabled(),
    email: !!(process.env.RESEND_API_KEY && process.env.AUTH_EMAIL_FROM),
    google: !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
    apple: !!(process.env.APPLE_SERVICES_ID && process.env.APPLE_TEAM_ID && process.env.APPLE_KEY_ID && process.env.APPLE_PRIVATE_KEY),
  };
}

const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const token = (n = 32) => randomBytes(n).toString("base64url");

export function cleanEmail(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const e = raw.trim().toLowerCase();
  return e.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e) ? e : null;
}

/** State-changing calls must come from this site. */
export async function sameOrigin(req: Request): Promise<boolean> {
  const o = req.headers.get("origin");
  if (!o) return req.headers.get("sec-fetch-site") === "same-origin";
  try {
    const host = req.headers.get("host");
    return new URL(o).host === host;
  } catch {
    return false;
  }
}

export async function clientIp(): Promise<string> {
  const h = await headers();
  return (h.get("x-forwarded-for") ?? "").split(",")[0].trim() || h.get("x-real-ip") || "unknown";
}

/** Fixed-window limit. True when allowed. */
export async function rateOk(key: string, max: number, windowS: number): Promise<boolean> {
  const k = K.rate(key);
  const n = Number(await redis(["INCR", k]));
  if (n === 1) await redis(["EXPIRE", k, windowS]);
  return n <= max;
}

async function getJson<T>(key: string): Promise<T | null> {
  const raw = (await redis(["GET", key])) as string | null;
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function getUser(id: string): Promise<User | null> {
  return getJson<User>(K.user(id));
}
async function saveUser(u: User) {
  await redis(["SET", K.user(u.id), JSON.stringify(u)]);
}

async function createUser(p: { email?: string | null; name?: string | null; image?: string | null; provider: Provider }): Promise<User> {
  const u: User = { id: token(12), email: p.email ?? null, name: p.name ?? null, image: p.image ?? null, providers: [p.provider], createdAt: new Date().toISOString() };
  await saveUser(u);
  if (u.email) await redis(["SET", K.email(u.email), u.id]);
  return u;
}

/** Find or make the account for a verified identity. Signed in already: link it to the current account. */
export async function resolveIdentity(p: { provider: Provider; sub?: string; email?: string | null; emailVerified?: boolean; name?: string | null; image?: string | null }, current: User | null): Promise<{ user: User } | { error: string }> {
  const email = p.email && p.emailVerified !== false ? cleanEmail(p.email) : null;
  const byOauth = p.sub ? ((await redis(["GET", K.oauth(p.provider, p.sub)])) as string | null) : null;
  const byEmail = email ? ((await redis(["GET", K.email(email)])) as string | null) : null;
  let user: User | null = null;
  if (current) {
    if ((byOauth && byOauth !== current.id) || (byEmail && byEmail !== current.id)) return { error: "That sign-in already belongs to another Portal Juice account." };
    user = current;
  } else {
    const id = byOauth ?? byEmail;
    user = id ? await getUser(id) : null;
    if (!user) user = await createUser({ email, name: p.name, image: p.image, provider: p.provider });
  }
  if (!user.providers.includes(p.provider)) user.providers.push(p.provider);
  if (email && !user.email) {
    user.email = email;
    await redis(["SET", K.email(email), user.id]);
  }
  if (!user.name && p.name) user.name = p.name;
  if (!user.image && p.image) user.image = p.image;
  await saveUser(user);
  if (p.sub) {
    await redis(["SET", K.oauth(p.provider, p.sub), user.id]);
    await rememberSub(user.id, p.provider, p.sub);
  }
  return { user };
}

export async function newDeviceAccount(): Promise<User> {
  return createUser({ provider: "device" });
}

/* Sessions */

export async function startSession(userId: string): Promise<void> {
  const t = token();
  const h = sha(t);
  await redis(["SET", K.sess(h), userId, "EX", SESSION_DAYS * 86400]);
  await redis(["SADD", K.userSess(userId), h]);
  (await cookies()).set(SESSION_COOKIE, t, { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: SESSION_DAYS * 86400 });
}

export async function currentUser(): Promise<User | null> {
  if (!chatEnabled()) return null;
  const t = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!t || t.length > 100) return null;
  const id = (await redis(["GET", K.sess(sha(t))])) as string | null;
  return id ? getUser(id) : null;
}

export async function endSession(): Promise<void> {
  const jar = await cookies();
  const t = jar.get(SESSION_COOKIE)?.value;
  if (t) {
    const h = sha(t);
    const id = (await redis(["GET", K.sess(h)])) as string | null;
    await redis(["DEL", K.sess(h)]);
    if (id) await redis(["SREM", K.userSess(id), h]);
  }
  jar.set(SESSION_COOKIE, "", { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 0 });
}

/** Everything tied to the account goes: sessions, sign-in links, cloud data, push links. */
export async function deleteAccount(u: User): Promise<void> {
  const sess = ((await redis(["SMEMBERS", K.userSess(u.id)])) as string[] | null) ?? [];
  for (const h of sess) await redis(["DEL", K.sess(h)]);
  if (u.email) await redis(["DEL", K.email(u.email)]);
  for (const p of ["google", "apple"]) {
    // Index is by provider subject; scan this user's links stored on the record.
    const subs = ((await redis(["SMEMBERS", `pj:auth:subs:${u.id}:${p}`])) as string[] | null) ?? [];
    for (const s of subs) await redis(["DEL", K.oauth(p, s)]);
    await redis(["DEL", `pj:auth:subs:${u.id}:${p}`]);
  }
  await unlinkAllPush(u.id);
  await dropSocial(u.id).catch(() => {});
  await revokeWidgetToken(u.id).catch(() => {});
  await redis(["DEL", K.userSess(u.id), K.user(u.id), `pj:sync:${u.id}`]);
}

export async function rememberSub(userId: string, provider: string, sub: string) {
  await redis(["SADD", `pj:auth:subs:${userId}:${provider}`, sub]);
}

/* Email code + link */

type Otp = { code: string; link: string; tries: number };

export async function startEmail(email: string, next: string): Promise<{ ok: true } | { error: string }> {
  if (!providersReady().email) return { error: "Email sign-in isn't set up yet." };
  const ip = await clientIp();
  if (!(await rateOk(`email:${email}`, 5, 3600)) || !(await rateOk(`emailip:${ip}`, 20, 3600))) return { error: "Too many codes. Try again in a bit." };
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const link = token(24);
  const salt = token(8);
  await redis(["SET", K.otp(email), JSON.stringify({ code: salt + ":" + sha(salt + code), link: sha(link), tries: 0 } satisfies Otp), "EX", 600]);
  const url = `${SITE}/account/verify?e=${encodeURIComponent(email)}&t=${link}${next ? `&next=${encodeURIComponent(next)}` : ""}`;
  const text = `Your Portal Juice code is ${code}\n\nOr open this link on the device you're signing in on:\n${url}\n\nIt works for 10 minutes. If you didn't ask for it, ignore this email.`;
  const html = `<div style="font-family:system-ui,sans-serif;background:#07050d;color:#fff;padding:24px;border-radius:16px"><h2 style="margin:0 0 8px;color:#c084fc">Portal Juice</h2><p>Your sign-in code:</p><p style="font-size:32px;font-weight:900;letter-spacing:6px;color:#39ff14">${code}</p><p><a href="${url}" style="color:#facc15;font-weight:700">Or tap to sign in</a></p><p style="color:#a1a1aa;font-size:12px">Works for 10 minutes. Your picks stay private. If you didn't ask for this, ignore it.</p></div>`;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: process.env.AUTH_EMAIL_FROM, to: [email], subject: `Portal Juice code: ${code}`, text, html }),
  }).catch(() => null);
  if (!res?.ok) return { error: "Couldn't send the email. Try again." };
  return { ok: true };
}

export async function verifyEmail(email: string, p: { code?: string; link?: string }): Promise<boolean> {
  const o = await getJson<Otp>(K.otp(email));
  if (!o || o.tries >= 5) return false;
  let ok = false;
  if (p.code && /^\d{6}$/.test(p.code)) {
    const [salt, h] = o.code.split(":");
    ok = safeEq(sha(salt + p.code), h);
  } else if (p.link && p.link.length < 100) {
    ok = safeEq(sha(p.link), o.link);
  }
  if (!ok) {
    await redis(["SET", K.otp(email), JSON.stringify({ ...o, tries: o.tries + 1 }), "KEEPTTL"]);
    return false;
  }
  await redis(["DEL", K.otp(email)]);
  return true;
}

function safeEq(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/* Add another device with a short code */

const ALPHA = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export async function startLink(userId: string): Promise<string> {
  let code = "";
  for (let i = 0; i < 8; i++) code += ALPHA[randomInt(0, ALPHA.length)];
  await redis(["SET", K.link(code), userId, "EX", 600]);
  return code;
}
export async function claimLink(raw: string): Promise<string | null> {
  const code = raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (code.length !== 8) return null;
  const id = (await redis(["GETDEL", K.link(code)])) as string | null;
  return id;
}

/* OAuth helpers */

export async function oauthState(provider: string, extra: Record<string, string> = {}, crossSite = false) {
  const state = token(16);
  const verifier = token(32);
  (await cookies()).set(`pj_oauth_${provider}`, JSON.stringify({ state, verifier, ...extra }), {
    httpOnly: true,
    secure: true,
    sameSite: crossSite ? "none" : "lax",
    path: "/api/auth",
    maxAge: 600,
  });
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { state, challenge };
}
export async function takeOauthState(provider: string): Promise<{ state: string; verifier: string; next?: string } | null> {
  const jar = await cookies();
  const raw = jar.get(`pj_oauth_${provider}`)?.value;
  jar.set(`pj_oauth_${provider}`, "", { path: "/api/auth", maxAge: 0, secure: true, httpOnly: true });
  try {
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function jwtClaims(jwt: string): Record<string, unknown> | null {
  try {
    return JSON.parse(Buffer.from(jwt.split(".")[1], "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

/** Apple wants a short-lived ES256 JWT as the client secret, signed with the .p8 key. */
export function appleClientSecret(): string {
  const header = { alg: "ES256", kid: process.env.APPLE_KEY_ID };
  const now = Math.floor(Date.now() / 1000);
  const body = { iss: process.env.APPLE_TEAM_ID, iat: now, exp: now + 300, aud: "https://appleid.apple.com", sub: process.env.APPLE_SERVICES_ID };
  const enc = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const data = `${enc(header)}.${enc(body)}`;
  const key = (process.env.APPLE_PRIVATE_KEY ?? "").replace(/\\n/g, "\n");
  const sig = createSign("SHA256").update(data).sign({ key, dsaEncoding: "ieee-p1363" }).toString("base64url");
  return `${data}.${sig}`;
}

export function safeNext(raw: string | null | undefined): string {
  return raw && raw.startsWith("/") && !raw.startsWith("//") ? raw.slice(0, 200) : "/account";
}

/* Push follows the account */

export async function linkPush(userId: string, endpoint: string) {
  await redis(["SADD", K.push(userId), endpoint]);
  const raw = (await redis(["HGET", "pj:push:subs", endpoint])) as string | null;
  if (raw) {
    try {
      const row = JSON.parse(raw);
      row.uid = userId;
      await redis(["HSET", "pj:push:subs", endpoint, JSON.stringify(row)]);
    } catch {
      /* skip */
    }
  }
}
async function unlinkAllPush(userId: string) {
  const eps = ((await redis(["SMEMBERS", K.push(userId)])) as string[] | null) ?? [];
  for (const ep of eps) {
    const raw = (await redis(["HGET", "pj:push:subs", ep])) as string | null;
    if (!raw) continue;
    try {
      const row = JSON.parse(raw);
      delete row.uid;
      await redis(["HSET", "pj:push:subs", ep, JSON.stringify(row)]);
    } catch {
      /* skip */
    }
  }
  await redis(["DEL", K.push(userId)]);
}

export function publicUser(u: User | null) {
  return u ? { id: u.id, email: u.email, name: u.name, image: u.image, providers: u.providers, createdAt: u.createdAt } : null;
}
