/**
 * Portal Coins: cosmetic-only currency. Coins and items have no cash value, can't be withdrawn or sent off
 * Portal Juice, and have nothing to do with picks or results. Shared by server and client (pure data).
 */

export type Rarity = "common" | "rare" | "epic" | "legendary";
export const RARITIES: Rarity[] = ["common", "rare", "epic", "legendary"];
export const RARITY_LABEL: Record<Rarity, string> = { common: "Common", rare: "Rare", epic: "Epic", legendary: "Legendary" };

export type Kind = "theme" | "emote" | "jersey" | "frame" | "font" | "tag";
/** Equip slots (emotes are just owned and usable). */
export const SLOTS = ["theme", "jersey", "frame", "font", "tag"] as const;
export type Slot = (typeof SLOTS)[number];
export const KIND_LABEL: Record<Kind, string> = { theme: "Home themes", emote: "Chat emotes", jersey: "Jerseys", frame: "Avatar frames", font: "Chat fonts", tag: "Chat tags" };
export type ThemeLook = { bg: string; accent: string; accent2: string; glow: string; header: "glow" | "outline" | "chrome" };
export type Item = {
  id: string;
  kind: Kind;
  /** Jersey colors/pattern, frame/tag/font style class suffix. */
  style?: string;
  colors?: [string, string];
  /** Animation: none | glow | shimmer | pulse | particles (legendary). */
  anim?: "glow" | "shimmer" | "pulse" | "particles";
  label?: string;
  name: string;
  rarity: Rarity;
  /** Fixed shop price in coins; null = only from a box. */
  price: number | null;
  /** Limited edition: total supply across all accounts. Each copy gets a serial #. */
  cap?: number;
  icon?: string;
  look?: ThemeLook;
};

export const ITEMS: Item[] = [
  { id: "t-void", kind: "theme", name: "Void Classic", rarity: "common", price: 0, look: { bg: "#030306", accent: "#c026ff", accent2: "#39ff14", glow: "rgba(192,38,255,.35)", header: "glow" } },
  { id: "t-aurora", kind: "theme", name: "Aurora Gate", rarity: "common", price: 150, look: { bg: "#03060a", accent: "#22d3ee", accent2: "#a78bfa", glow: "rgba(34,211,238,.32)", header: "glow" } },
  { id: "t-rift", kind: "theme", name: "Magenta Rift", rarity: "rare", price: 300, look: { bg: "#08030a", accent: "#e879f9", accent2: "#fb7185", glow: "rgba(232,121,249,.38)", header: "outline" } },
  { id: "t-slime", kind: "theme", name: "Slime Core", rarity: "rare", price: 300, look: { bg: "#020803", accent: "#39ff14", accent2: "#a3e635", glow: "rgba(57,255,20,.30)", header: "glow" } },
  { id: "t-solar", kind: "theme", name: "Solar Flare", rarity: "epic", price: 600, look: { bg: "#0a0502", accent: "#f59e0b", accent2: "#f43f5e", glow: "rgba(245,158,11,.34)", header: "chrome" } },
  { id: "t-cryo", kind: "theme", name: "Cryo Portal", rarity: "epic", price: 600, look: { bg: "#02060c", accent: "#7dd3fc", accent2: "#e0f2fe", glow: "rgba(125,211,252,.32)", header: "chrome" } },
  { id: "t-eclipse", kind: "theme", name: "Eclipse", rarity: "legendary", price: null, cap: 250, look: { bg: "#000000", accent: "#f5c542", accent2: "#c026ff", glow: "rgba(245,197,66,.40)", header: "chrome" } },
  { id: "e-juice", kind: "emote", name: "Juice", rarity: "common", price: 50, icon: "🧃" },
  { id: "e-eyes", kind: "emote", name: "Watching", rarity: "common", price: 50, icon: "👀" },
  { id: "e-lock", kind: "emote", name: "Lock it", rarity: "common", price: 50, icon: "🔒" },
  { id: "e-rocket", kind: "emote", name: "Liftoff", rarity: "rare", price: 120, icon: "🚀" },
  { id: "e-goat", kind: "emote", name: "GOAT", rarity: "rare", price: 120, icon: "🐐" },
  { id: "e-ice", kind: "emote", name: "Ice cold", rarity: "rare", price: 120, icon: "🧊" },
  { id: "e-alien", kind: "emote", name: "Visitor", rarity: "epic", price: 250, icon: "👽" },
  { id: "e-comet", kind: "emote", name: "Comet", rarity: "epic", price: 250, icon: "☄️" },
  { id: "e-gem", kind: "emote", name: "Diamond", rarity: "legendary", price: null, cap: 500, icon: "💎" },
  { id: "j-home", kind: "jersey", name: "Portal Home", rarity: "common", price: 0, style: "solid", colors: ["#7c3aed", "#efe8ff"] },
  { id: "j-pinstripe", kind: "jersey", name: "Night Pinstripe", rarity: "common", price: 80, style: "pin", colors: ["#111827", "#a78bfa"] },
  { id: "j-volt", kind: "jersey", name: "Volt Sleeves", rarity: "rare", price: 180, style: "sleeve", colors: ["#0b0716", "#39ff14"] },
  { id: "j-sunset", kind: "jersey", name: "Sunset Fade", rarity: "rare", price: 180, style: "fade", colors: ["#f43f5e", "#f59e0b"], anim: "shimmer" },
  { id: "j-hyper", kind: "jersey", name: "Hyperdrive", rarity: "epic", price: 400, style: "chevron", colors: ["#22d3ee", "#c026ff"], anim: "glow" },
  { id: "j-gold", kind: "jersey", name: "Golden Portal", rarity: "legendary", price: null, cap: 300, style: "fade", colors: ["#f5c542", "#c026ff"], anim: "particles" },
  { id: "f-ring", kind: "frame", name: "Neon Ring", rarity: "common", price: 60, style: "ring", colors: ["#c026ff", "#c026ff"] },
  { id: "f-duo", kind: "frame", name: "Dual Ring", rarity: "rare", price: 150, style: "duo", colors: ["#39ff14", "#22d3ee"], anim: "glow" },
  { id: "f-orbit", kind: "frame", name: "Orbit", rarity: "epic", price: 350, style: "orbit", colors: ["#e879f9", "#7dd3fc"], anim: "shimmer" },
  { id: "f-halo", kind: "frame", name: "Event Horizon", rarity: "legendary", price: null, cap: 300, style: "halo", colors: ["#f5c542", "#c026ff"], anim: "particles" },
  { id: "n-mono", kind: "font", name: "Terminal", rarity: "common", price: 60, style: "mono" },
  { id: "n-wide", kind: "font", name: "Widebody", rarity: "rare", price: 150, style: "wide" },
  { id: "n-neon", kind: "font", name: "Neon Tube", rarity: "epic", price: 350, style: "neon", anim: "glow" },
  { id: "n-chrome", kind: "font", name: "Liquid Chrome", rarity: "legendary", price: null, cap: 400, style: "chrome", anim: "shimmer" },
  { id: "g-rookie", kind: "tag", name: "Rookie", rarity: "common", price: 40, label: "ROOKIE", colors: ["#a1a1aa", "#3f3f46"] },
  { id: "g-sweat", kind: "tag", name: "Sweater", rarity: "rare", price: 120, label: "SWEATER", colors: ["#fb7185", "#4c0519"], anim: "pulse" },
  { id: "g-sharp", kind: "tag", name: "Sharp", rarity: "epic", price: 300, label: "SHARP", colors: ["#22d3ee", "#083344"], anim: "shimmer" },
  { id: "g-oracle", kind: "tag", name: "Oracle", rarity: "legendary", price: null, cap: 250, label: "ORACLE", colors: ["#f5c542", "#3b0764"], anim: "particles" },
];
export const itemOf = (id: string) => ITEMS.find((i) => i.id === id) ?? null;

/** Emotes everyone has (the existing portal set). */
export const FREE_EMOTES: { id: string; icon: string; name: string }[] = [
  { id: "fire", icon: "🔥", name: "Fire" },
  { id: "heart", icon: "💓", name: "Sweat" },
  { id: "target", icon: "🎯", name: "Called it" },
  { id: "cry", icon: "😭", name: "Pain" },
];
export function emoteGlyph(id: string): string | null {
  return FREE_EMOTES.find((e) => e.id === id)?.icon ?? itemOf(id)?.icon ?? null;
}

export type Box = { id: string; name: string; price: number; kind: Item["kind"]; odds: Record<Rarity, number> };
/** Odds are percentages and are shown in full before every open. */
export const BOXES: Box[] = [
  { id: "b-emote", name: "Neon Emote Box", price: 100, kind: "emote", odds: { common: 60, rare: 28, epic: 10, legendary: 2 } },
  { id: "b-theme", name: "Home Theme Box", price: 250, kind: "theme", odds: { common: 55, rare: 30, epic: 12, legendary: 3 } },
  { id: "b-jersey", name: "Jersey Box", price: 150, kind: "jersey", odds: { common: 55, rare: 30, epic: 12, legendary: 3 } },
  { id: "b-frame", name: "Frame Box", price: 120, kind: "frame", odds: { common: 55, rare: 30, epic: 12, legendary: 3 } },
  { id: "b-font", name: "Chat Font Box", price: 120, kind: "font", odds: { common: 55, rare: 30, epic: 12, legendary: 3 } },
  { id: "b-tag", name: "Chat Tag Box", price: 100, kind: "tag", odds: { common: 55, rare: 30, epic: 12, legendary: 3 } },
];
export const boxOf = (id: string) => BOXES.find((b) => b.id === id) ?? null;
/** Items a box can give (the free default theme is never in a box). */
export const boxItems = (b: Box) => ITEMS.filter((i) => i.kind === b.kind && i.price !== 0);
/** Per-item odds as shown: tier % split evenly across that tier's items. */
export function itemOdds(b: Box): { item: Item; pct: number }[] {
  const items = boxItems(b);
  return items.map((item) => ({ item, pct: b.odds[item.rarity] / items.filter((i) => i.rarity === item.rarity).length }));
}
/** Sold-out rule (shown on the box): a legendary roll when every limited legendary is gone gives an epic instead. */
export const SOLD_OUT_RULE = "If every limited Legendary in this box is sold out, a Legendary roll gives an Epic from this box instead.";

export type Challenge = { id: string; period: "day" | "week"; label: string; hint: string; reward: number; href: string };
/** Built only on app activity the server can see. Never on results, stakes or money. */
export const CHALLENGES: Challenge[] = [
  { id: "d-pick", period: "day", label: "Log a pick", hint: "Track any pick today (signed in).", reward: 10, href: "/lines" },
  { id: "d-position", period: "day", label: "Share a live position", hint: "Put one open pick up for friends.", reward: 10, href: "/lines/portfolio" },
  { id: "d-chat", period: "day", label: "Say something in a squad", hint: "Send one squad chat message.", reward: 10, href: "/friends" },
  { id: "d-react", period: "day", label: "React in squad chat", hint: "Drop an emote on a squad message.", reward: 5, href: "/friends" },
  { id: "w-streak", period: "week", label: "5-day streak", hint: "Finish a daily challenge on 5 days this week.", reward: 50, href: "/coins" },
  { id: "w-squad", period: "week", label: "Squad regular", hint: "Chat in a squad on 3 days this week.", reward: 30, href: "/friends" },
];

/** StoreKit consumables (iPhone app only). */
export const COIN_PACKS: { id: string; coins: number; price: string; name: string }[] = [
  { id: "app.portaljuice.coins.100", coins: 100, price: "$0.99", name: "100 Coins" },
  { id: "app.portaljuice.coins.550", coins: 550, price: "$4.99", name: "550 Coins" },
  { id: "app.portaljuice.coins.1200", coins: 1200, price: "$9.99", name: "1,200 Coins" },
];

export const MARKET_FEE_PCT = 5;
export const marketFee = (price: number) => Math.max(1, Math.floor((price * MARKET_FEE_PCT) / 100));
export const MIN_LIST = 10;
export const MAX_LIST = 100000;

export const NO_VALUE_COPY = "Coins and items are cosmetic only. They have no cash value, can't be cashed out or sent off Portal Juice, and have nothing to do with picks or results.";

/** Los Angeles calendar day and Monday-start week, so challenges reset at local midnight PT. */
export function laDay(d = new Date()): string {
  return d.toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });
}
export function laWeek(d = new Date()): string {
  const day = laDay(d);
  const t = new Date(`${day}T12:00:00Z`);
  const dow = (t.getUTCDay() + 6) % 7;
  t.setUTCDate(t.getUTCDate() - dow);
  return t.toISOString().slice(0, 10);
}
export function weekDays(week: string): string[] {
  const t = new Date(`${week}T12:00:00Z`);
  return Array.from({ length: 7 }, (_, i) => new Date(t.getTime() + i * 86400000).toISOString().slice(0, 10));
}

/** Defaults everyone has equipped until they choose. */
export const DEFAULT_EQUIP: Partial<Record<Slot, string>> = { theme: "t-void", jersey: "j-home" };
/** Public look: what friends see next to a name. */
export type Look = Partial<Record<Slot, string>>;
