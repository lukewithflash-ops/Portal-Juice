/**
 * Portal-themed push payloads. Pure: no fetches, so tests can run it.
 * The OS owns the banner; we fill every field it lets us: emoji title, short body with the clock,
 * a rich image, team-themed icon, monochrome badge, per-game tag, renotify, actions, vibration.
 */
import type { GameAlert } from "@/lib/alerts";

export type PushPayload = {
  title: string;
  body: string;
  url: string;
  tag: string;
  renotify: boolean;
  image: string | null;
  icon: string;
  badge: string;
  vibrate: number[];
  actions: { action: string; title: string }[];
  game: string | null;
  /** Quiet update: no sound or buzz (routine live-tile refresh). */
  silent?: boolean;
  /** PWA app badge: live picks right now. */
  count?: number;
};

export type PushScene = {
  league: string;
  awayAbbr: string;
  homeAbbr: string;
  awayScore: string | null;
  homeScore: string | null;
  awayColor: string;
  homeColor: string;
  awayId: string;
  homeId: string;
  detail: string;
};

export type FavTeam = { abbr: string; color?: string | null; alt?: string | null } | null;

export const BADGE = "/icons/badge-96.png";
export const APP_ICON = "/icons/icon-192.png";

const SPORT_EMOJI: Record<string, string> = { nfl: "🏈", ncaaf: "🏈", nba: "🏀", wnba: "🏀", ncaam: "🏀", ncaaw: "🏀", mlb: "⚾", nhl: "🏒" };
export const sportEmoji = (league: string) => SPORT_EMOJI[league] ?? "⚽";

const hex = (c: string | null | undefined) => (c ?? "").replace("#", "").match(/^[0-9a-fA-F]{6}$/)?.[0] ?? null;

/** The game an alert belongs to, from its url ("/games/nfl/401..."). */
export function gameOf(url: string): string | null {
  const m = url.match(/^\/(?:games|sports)\/([a-z0-9]+)\/(\d+)/);
  return m ? `${m[1]}/${m[2]}` : null;
}

/** Big-play label → short tag and emoji. */
function bigTag(title: string, league: string): { tag: string; emoji: string } {
  const t = title.toLowerCase();
  if (/touchdown/.test(t)) return { tag: "TD", emoji: "🏈🎆" };
  if (/goal/.test(t)) return { tag: "GOAL", emoji: league === "nhl" ? "🚨" : "⚽" };
  if (/three|3/.test(t)) return { tag: "3", emoji: "🎯" };
  if (/home run|homer/.test(t)) return { tag: "HR", emoji: "💥" };
  if (/pick|intercept|fumble|turnover/.test(t)) return { tag: title, emoji: "🛑" };
  return { tag: title, emoji: "⚡" };
}

const score = (s: PushScene) => `${s.awayAbbr} ${s.awayScore ?? 0}-${s.homeScore ?? 0} ${s.homeAbbr}`;

/** Title, body, and the image recipe for one alert. */
export function styleAlert(a: GameAlert, scene: PushScene | null, fav: FavTeam, origin = ""): PushPayload {
  const league = scene?.league ?? gameOf(a.url)?.split("/")[0] ?? "";
  const clock = scene?.detail ? ` · ${scene.detail}` : "";
  const m = a.meter;
  const fmtLine = (n: number) => (Number.isInteger(n) ? `${n}` : `${Math.ceil(n)}+`);
  let title = a.title;
  let emoji = "🟣";
  let body = a.body;
  let big = false;
  switch (a.kind) {
    case "cleared":
      emoji = "🟡";
      title = m ? `🟡 Hit! ${m.name} ${m.side === "Under" ? `under ${m.line}` : fmtLine(m.line)} ${shortMarket(m.market)}` : "🟡 Hit!";
      body = `${a.body}${clock}`;
      big = true;
      break;
    case "player":
      emoji = "⭐";
      title = m ? `⭐ ${m.name} ${m.value ?? "—"} of ${m.line} ${shortMarket(m.market)}` : `⭐ ${a.title}`;
      body = `${a.body}${clock}`;
      break;
    case "close":
      emoji = "⏳";
      title = `⏳ ${a.title} ${m ? `${m.name}` : ""}`.trim();
      body = `${a.body}${clock}`;
      big = true;
      break;
    case "big": {
      const b = bigTag(a.title, league);
      emoji = b.emoji;
      title = scene ? `${b.emoji} ${b.tag} · ${score(scene)}` : `${b.emoji} ${a.title}`;
      body = `${a.body.slice(0, 110)}${clock}`;
      big = true;
      break;
    }
    case "lead":
      emoji = "🔄";
      title = `🔄 ${a.title}${scene ? ` · ${score(scene)}` : ""}`;
      body = scene?.detail ?? a.body;
      big = true;
      break;
    case "final":
      emoji = "🏁";
      title = `🏁 Final · ${scene ? score(scene) : a.body}`;
      body = "Tap for the recap.";
      big = true;
      break;
    case "score":
      emoji = sportEmoji(league);
      title = `${sportEmoji(league)} ${a.title}${scene ? ` · ${score(scene)}` : ""}`;
      body = scene?.detail ?? a.body;
      break;
  }
  const game = gameOf(a.url);
  const q = new URLSearchParams();
  q.set("k", a.kind);
  q.set("e", emoji);
  q.set("t", title.replace(/^\S+\s/, "").slice(0, 60));
  q.set("lg", league);
  if (scene) {
    q.set("a", scene.awayAbbr);
    q.set("h", scene.homeAbbr);
    q.set("as", scene.awayScore ?? "0");
    q.set("hs", scene.homeScore ?? "0");
    q.set("ac", hex(scene.awayColor) ?? "7C3AED");
    q.set("hc", hex(scene.homeColor) ?? "F5C542");
    q.set("ai", scene.awayId);
    q.set("hi", scene.homeId);
    q.set("d", scene.detail.slice(0, 30));
  }
  if (m) {
    q.set("p", m.name.slice(0, 40));
    if (m.athleteId) q.set("pid", m.athleteId);
    if (m.value !== null) q.set("v", String(m.value));
    q.set("l", String(m.line));
    q.set("mk", shortMarket(m.market).slice(0, 20));
    q.set("sd", m.side);
  }
  const favColor = hex(fav?.color ?? null);
  const icon = fav && favColor ? `${origin}/api/icon?size=192&color=${favColor}&alt=${hex(fav.alt ?? null) ?? "F5C542"}&abbr=${encodeURIComponent(fav.abbr)}` : `${origin}${APP_ICON}`;
  return {
    title: title.slice(0, 80),
    body: body.slice(0, 140),
    url: a.url,
    tag: game ? `pj:${game}` : a.key,
    renotify: big,
    image: `${origin}/api/push/img?${q.toString()}`,
    icon,
    badge: `${origin}${BADGE}`,
    vibrate: big ? [90, 40, 90, 40, 220] : [60],
    actions: game ? [{ action: "open", title: "Open game" }, { action: "mute", title: "Mute game" }] : [{ action: "open", title: "Open" }],
    game,
  };
}

function shortMarket(m: string): string {
  return m
    .replace(/points/i, "pts")
    .replace(/rebounds/i, "reb")
    .replace(/assists/i, "ast")
    .replace(/passing yards/i, "pass yds")
    .replace(/rushing yards/i, "rush yds")
    .replace(/receiving yards/i, "rec yds")
    .replace(/\s+/g, " ")
    .trim();
}

export type TileLeg = { name: string; value: number | null; line: number; side: "Over" | "Under" };

const lastName = (n: string) => n.trim().split(/\s+/).slice(-1)[0] ?? n;

/** Lock-screen live tile: one per game, same tag as that game's alerts so each update replaces the last. */
export function liveTile(game: string, url: string, scene: PushScene, state: "in" | "post", legs: TileLeg[], origin = ""): PushPayload {
  const sc = `${scene.awayAbbr} ${scene.awayScore ?? 0}-${scene.homeScore ?? 0} ${scene.homeAbbr}`;
  const clock = state === "post" ? "Final" : scene.detail.replace(/\s*-\s*/, " ").replace(/(\d)(st|nd|rd|th)\b/, "$1$2").trim();
  const title = `${sportEmoji(scene.league)} ${sc} · ${clock}`.slice(0, 80);
  const body = legs.length ? legs.map((l) => `${lastName(l.name)} ${l.value ?? 0}/${l.line}`).join(" · ") : state === "post" ? "Final. Tap for the recap." : "Live. Tap to watch.";
  const q = new URLSearchParams();
  q.set("k", "live");
  q.set("e", sportEmoji(scene.league));
  q.set("t", `${sc} · ${clock}`.slice(0, 60));
  q.set("lg", scene.league);
  q.set("a", scene.awayAbbr);
  q.set("h", scene.homeAbbr);
  q.set("as", scene.awayScore ?? "0");
  q.set("hs", scene.homeScore ?? "0");
  q.set("ac", hex(scene.awayColor) ?? "7C3AED");
  q.set("hc", hex(scene.homeColor) ?? "F5C542");
  q.set("ai", scene.awayId);
  q.set("hi", scene.homeId);
  q.set("d", clock.slice(0, 30));
  if (legs.length) q.set("ms", legs.slice(0, 3).map((l) => `${lastName(l.name).replace(/[~|]/g, "")}~${l.value ?? ""}~${l.line}~${l.side === "Under" ? "U" : "O"}`).join("|"));
  return {
    title,
    body: body.slice(0, 140),
    url,
    tag: `pj:${game}`,
    renotify: false,
    silent: true,
    image: `${origin}/api/push/img?${q.toString()}`,
    icon: `${origin}${APP_ICON}`,
    badge: `${origin}${BADGE}`,
    vibrate: [],
    actions: [{ action: "open", title: "Open game" }, { action: "mute", title: "Mute game" }],
    game,
  };
}

/** Send a tile now? Final once, on a score change (at most once a minute), else every 150s. */
export function tileDue(prev: { sig: string; at: number; final?: boolean } | null, sig: string, state: "in" | "post", now: number): boolean {
  if (state === "post") return !prev?.final;
  if (!prev) return true;
  if (prev.sig !== sig) return now - prev.at >= 60_000;
  return now - prev.at >= 150_000;
}
