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
  /** Collection this item belongs to (e.g. a city colors set). Original designs only: no team names or marks. */
  set?: string;
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
  { id: "e-bucket", kind: "emote", name: "Bucket", rarity: "common", price: 50, icon: "🏀" },
  { id: "e-100", kind: "emote", name: "Hundred", rarity: "common", price: 50, icon: "💯" },
  { id: "e-salute", kind: "emote", name: "Respect", rarity: "common", price: 50, icon: "🫡" },
  { id: "e-brain", kind: "emote", name: "Big brain", rarity: "rare", price: 120, icon: "🧠", anim: "pulse" },
  { id: "e-cold", kind: "emote", name: "Frozen", rarity: "rare", price: 120, icon: "🥶", anim: "pulse" },
  { id: "e-bolt", kind: "emote", name: "Zap", rarity: "rare", price: 120, icon: "⚡", anim: "glow" },
  { id: "e-mind", kind: "emote", name: "Mind blown", rarity: "epic", price: 260, icon: "🤯", anim: "shimmer" },
  { id: "e-portal", kind: "emote", name: "Portal", rarity: "epic", price: 260, icon: "🌀", anim: "glow" },
  { id: "e-volcano", kind: "emote", name: "Eruption", rarity: "epic", price: 260, icon: "🌋", anim: "shimmer" },
  { id: "e-crown", kind: "emote", name: "Crown", rarity: "legendary", price: null, cap: 400, icon: "👑", anim: "particles" },
  { id: "e-planet", kind: "emote", name: "Other world", rarity: "legendary", price: null, cap: 400, icon: "🪐", anim: "particles" },
  { id: "f-hex", kind: "frame", name: "Hex Gate", rarity: "common", price: 70, style: "ring", colors: ["#22d3ee", "#22d3ee"] },
  { id: "f-lava", kind: "frame", name: "Lava Ring", rarity: "rare", price: 160, style: "duo", colors: ["#f43f5e", "#f59e0b"], anim: "glow" },
  { id: "f-nebula", kind: "frame", name: "Nebula", rarity: "epic", price: 380, style: "orbit", colors: ["#a78bfa", "#39ff14"], anim: "shimmer" },
  { id: "f-singularity", kind: "frame", name: "Singularity", rarity: "legendary", price: null, cap: 300, style: "halo", colors: ["#39ff14", "#c026ff"], anim: "particles" },
  { id: "n-round", kind: "font", name: "Bubble", rarity: "common", price: 60, style: "round" },
  { id: "n-glitch", kind: "font", name: "Glitch", rarity: "epic", price: 360, style: "glitch", anim: "shimmer" },
  { id: "n-plasma", kind: "font", name: "Plasma", rarity: "legendary", price: null, cap: 400, style: "neon", anim: "particles" },
  { id: "g-fan", kind: "tag", name: "Die-hard", rarity: "common", price: 40, label: "DIE-HARD", colors: ["#a78bfa", "#1e1b4b"] },
  { id: "g-clutch", kind: "tag", name: "Clutch", rarity: "rare", price: 130, label: "CLUTCH", colors: ["#39ff14", "#052e16"], anim: "pulse" },
  { id: "g-nerd", kind: "tag", name: "Stat Nerd", rarity: "epic", price: 300, label: "STAT NERD", colors: ["#e879f9", "#3b0764"], anim: "shimmer" },
  { id: "g-portal", kind: "tag", name: "Portal Walker", rarity: "legendary", price: null, cap: 250, label: "PORTAL WALKER", colors: ["#39ff14", "#c026ff"], anim: "particles" },
  { id: "g-launch", kind: "tag", name: "Launch Week", rarity: "legendary", price: null, cap: 2000, label: "LAUNCH WEEK", colors: ["#39ff14", "#c026ff"], anim: "particles" },
  { id: "g-vip", kind: "tag", name: "VIP", rarity: "legendary", price: null, label: "VIP", colors: ["#f5c542", "#3b0764"], anim: "particles" },
  { id: "t-nebula", kind: "theme", name: "Nebula Drift", rarity: "rare", price: 320, look: { bg: "#05030c", accent: "#a78bfa", accent2: "#39ff14", glow: "rgba(167,139,250,.36)", header: "outline" } },
  { id: "t-plasma", kind: "theme", name: "Plasma Storm", rarity: "legendary", price: null, cap: 250, look: { bg: "#020004", accent: "#39ff14", accent2: "#e879f9", glow: "rgba(57,255,20,.40)", header: "chrome" } },
  { id: "j-galaxy", kind: "jersey", name: "Galaxy Stripe", rarity: "epic", price: 420, style: "pin", colors: ["#1e1b4b", "#e879f9"], anim: "shimmer" },
  { id: "j-void", kind: "jersey", name: "Void Walker", rarity: "legendary", price: null, cap: 300, style: "chevron", colors: ["#000000", "#39ff14"], anim: "particles" },
  { id: "j-c-bos", kind: "jersey", set: "Boston Green", name: "Boston Green Home", rarity: "rare", price: 200, style: "sleeve", colors: ["#007a33", "#e9f5ee"] },
  { id: "j-c-bos-alt", kind: "jersey", set: "Boston Green", name: "Boston Green Night", rarity: "epic", price: 450, style: "chevron", colors: ["#e9f5ee", "#007a33"], anim: "glow" },
  { id: "g-c-bos", kind: "tag", set: "Boston Green", name: "Boston Green Tag", rarity: "rare", price: 140, label: "BOSTON", colors: ["#007a33", "#0a0a0f"], anim: "pulse" },
  { id: "t-c-bos", kind: "theme", set: "Boston Green", name: "Boston Green Portal", rarity: "epic", price: 650, look: { bg: "#040408", accent: "#007a33", accent2: "#e9f5ee", glow: "#007a3355", header: "glow" } },
  { id: "j-c-la", kind: "jersey", set: "LA Gold", name: "LA Gold Home", rarity: "rare", price: 200, style: "sleeve", colors: ["#fdb927", "#552583"] },
  { id: "j-c-la-alt", kind: "jersey", set: "LA Gold", name: "LA Gold Night", rarity: "epic", price: 450, style: "chevron", colors: ["#552583", "#fdb927"], anim: "glow" },
  { id: "g-c-la", kind: "tag", set: "LA Gold", name: "LA Gold Tag", rarity: "rare", price: 140, label: "LA", colors: ["#fdb927", "#0a0a0f"], anim: "pulse" },
  { id: "t-c-la", kind: "theme", set: "LA Gold", name: "LA Gold Portal", rarity: "epic", price: 650, look: { bg: "#040408", accent: "#fdb927", accent2: "#552583", glow: "#fdb92755", header: "glow" } },
  { id: "j-c-bay", kind: "jersey", set: "Bay Blue & Gold", name: "Bay Blue & Gold Home", rarity: "rare", price: 200, style: "sleeve", colors: ["#1d428a", "#ffc72c"] },
  { id: "j-c-bay-alt", kind: "jersey", set: "Bay Blue & Gold", name: "Bay Blue & Gold Night", rarity: "epic", price: 450, style: "chevron", colors: ["#ffc72c", "#1d428a"], anim: "glow" },
  { id: "g-c-bay", kind: "tag", set: "Bay Blue & Gold", name: "Bay Blue & Gold Tag", rarity: "rare", price: 140, label: "BAY", colors: ["#1d428a", "#0a0a0f"], anim: "pulse" },
  { id: "t-c-bay", kind: "theme", set: "Bay Blue & Gold", name: "Bay Blue & Gold Portal", rarity: "epic", price: 650, look: { bg: "#040408", accent: "#1d428a", accent2: "#ffc72c", glow: "#1d428a55", header: "glow" } },
  { id: "j-c-chi", kind: "jersey", set: "Windy City Red", name: "Windy City Red Home", rarity: "rare", price: 200, style: "sleeve", colors: ["#ce1141", "#111111"] },
  { id: "j-c-chi-alt", kind: "jersey", set: "Windy City Red", name: "Windy City Red Night", rarity: "epic", price: 450, style: "chevron", colors: ["#111111", "#ce1141"], anim: "glow" },
  { id: "g-c-chi", kind: "tag", set: "Windy City Red", name: "Windy City Red Tag", rarity: "rare", price: 140, label: "WINDY CITY", colors: ["#ce1141", "#0a0a0f"], anim: "pulse" },
  { id: "t-c-chi", kind: "theme", set: "Windy City Red", name: "Windy City Red Portal", rarity: "epic", price: 650, look: { bg: "#040408", accent: "#ce1141", accent2: "#111111", glow: "#ce114155", header: "glow" } },
  { id: "j-c-ny", kind: "jersey", set: "Empire Orange", name: "Empire Orange Home", rarity: "rare", price: 200, style: "sleeve", colors: ["#f58426", "#006bb6"] },
  { id: "j-c-ny-alt", kind: "jersey", set: "Empire Orange", name: "Empire Orange Night", rarity: "epic", price: 450, style: "chevron", colors: ["#006bb6", "#f58426"], anim: "glow" },
  { id: "g-c-ny", kind: "tag", set: "Empire Orange", name: "Empire Orange Tag", rarity: "rare", price: 140, label: "EMPIRE", colors: ["#f58426", "#0a0a0f"], anim: "pulse" },
  { id: "t-c-ny", kind: "theme", set: "Empire Orange", name: "Empire Orange Portal", rarity: "epic", price: 650, look: { bg: "#040408", accent: "#f58426", accent2: "#006bb6", glow: "#f5842655", header: "glow" } },
  { id: "j-c-mia", kind: "jersey", set: "South Beach Pink", name: "South Beach Pink Home", rarity: "rare", price: 200, style: "sleeve", colors: ["#ff5fa2", "#41b6e6"] },
  { id: "j-c-mia-alt", kind: "jersey", set: "South Beach Pink", name: "South Beach Pink Night", rarity: "epic", price: 450, style: "chevron", colors: ["#41b6e6", "#ff5fa2"], anim: "glow" },
  { id: "g-c-mia", kind: "tag", set: "South Beach Pink", name: "South Beach Pink Tag", rarity: "rare", price: 140, label: "SOUTH BEACH", colors: ["#ff5fa2", "#0a0a0f"], anim: "pulse" },
  { id: "t-c-mia", kind: "theme", set: "South Beach Pink", name: "South Beach Pink Portal", rarity: "epic", price: 650, look: { bg: "#040408", accent: "#ff5fa2", accent2: "#41b6e6", glow: "#ff5fa255", header: "glow" } },
  { id: "j-c-phl", kind: "jersey", set: "Philly Kelly", name: "Philly Kelly Home", rarity: "rare", price: 200, style: "sleeve", colors: ["#00a651", "#c0c0c0"] },
  { id: "j-c-phl-alt", kind: "jersey", set: "Philly Kelly", name: "Philly Kelly Night", rarity: "epic", price: 450, style: "chevron", colors: ["#c0c0c0", "#00a651"], anim: "glow" },
  { id: "g-c-phl", kind: "tag", set: "Philly Kelly", name: "Philly Kelly Tag", rarity: "rare", price: 140, label: "PHILLY", colors: ["#00a651", "#0a0a0f"], anim: "pulse" },
  { id: "t-c-phl", kind: "theme", set: "Philly Kelly", name: "Philly Kelly Portal", rarity: "epic", price: 650, look: { bg: "#040408", accent: "#00a651", accent2: "#c0c0c0", glow: "#00a65155", header: "glow" } },
  { id: "j-c-dal", kind: "jersey", set: "Lone Star Silver", name: "Lone Star Silver Home", rarity: "rare", price: 200, style: "sleeve", colors: ["#b0b7bc", "#002b5e"] },
  { id: "j-c-dal-alt", kind: "jersey", set: "Lone Star Silver", name: "Lone Star Silver Night", rarity: "epic", price: 450, style: "chevron", colors: ["#002b5e", "#b0b7bc"], anim: "glow" },
  { id: "g-c-dal", kind: "tag", set: "Lone Star Silver", name: "Lone Star Silver Tag", rarity: "rare", price: 140, label: "LONE STAR", colors: ["#b0b7bc", "#0a0a0f"], anim: "pulse" },
  { id: "t-c-dal", kind: "theme", set: "Lone Star Silver", name: "Lone Star Silver Portal", rarity: "epic", price: 650, look: { bg: "#040408", accent: "#b0b7bc", accent2: "#002b5e", glow: "#b0b7bc55", header: "glow" } },
  { id: "j-c-den", kind: "jersey", set: "Mile High Orange", name: "Mile High Orange Home", rarity: "rare", price: 200, style: "sleeve", colors: ["#fb4f14", "#0b2265"] },
  { id: "j-c-den-alt", kind: "jersey", set: "Mile High Orange", name: "Mile High Orange Night", rarity: "epic", price: 450, style: "chevron", colors: ["#0b2265", "#fb4f14"], anim: "glow" },
  { id: "g-c-den", kind: "tag", set: "Mile High Orange", name: "Mile High Orange Tag", rarity: "rare", price: 140, label: "MILE HIGH", colors: ["#fb4f14", "#0a0a0f"], anim: "pulse" },
  { id: "t-c-den", kind: "theme", set: "Mile High Orange", name: "Mile High Orange Portal", rarity: "epic", price: 650, look: { bg: "#040408", accent: "#fb4f14", accent2: "#0b2265", glow: "#fb4f1455", header: "glow" } },
  { id: "j-c-tor", kind: "jersey", set: "North Purple", name: "North Purple Home", rarity: "rare", price: 200, style: "sleeve", colors: ["#753bbd", "#e6e6e6"] },
  { id: "j-c-tor-alt", kind: "jersey", set: "North Purple", name: "North Purple Night", rarity: "epic", price: 450, style: "chevron", colors: ["#e6e6e6", "#753bbd"], anim: "glow" },
  { id: "g-c-tor", kind: "tag", set: "North Purple", name: "North Purple Tag", rarity: "rare", price: 140, label: "NORTH", colors: ["#753bbd", "#0a0a0f"], anim: "pulse" },
  { id: "t-c-tor", kind: "theme", set: "North Purple", name: "North Purple Portal", rarity: "epic", price: 650, look: { bg: "#040408", accent: "#753bbd", accent2: "#e6e6e6", glow: "#753bbd55", header: "glow" } },
];
export const itemOf = (id: string) => ITEMS.find((i) => i.id === id) ?? null;

/** Emotes everyone has (the existing portal set). */
export const FREE_EMOTES: { id: string; icon: string; name: string }[] = [
  { id: "fire", icon: "🔥", name: "Fire" },
  { id: "heart", icon: "💓", name: "Sweat" },
  { id: "target", icon: "🎯", name: "Called it" },
  { id: "cry", icon: "😭", name: "Pain" },
];
export function emoteAnim(id: string): string {
  return itemOf(id)?.anim ?? "";
}
/** City colors sets (original designs in city colors, generic names, no team or league marks). */
export const SETS = [...new Set(ITEMS.map((i) => i.set).filter(Boolean))] as string[];
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
export const boxItems = (b: Box) => ITEMS.filter((i) => i.kind === b.kind && i.price !== 0 && i.id !== "g-vip" && i.id !== "g-launch");
/** Per-item odds as shown: tier % split evenly across that tier's items. */
export function itemOdds(b: Box): { item: Item; pct: number }[] {
  const items = boxItems(b);
  return items.map((item) => ({ item, pct: b.odds[item.rarity] / items.filter((i) => i.rarity === item.rarity).length }));
}
/** Sold-out rule (shown on the box): a legendary roll when every limited legendary is gone gives an epic instead. */
export const SOLD_OUT_RULE = "If every limited Legendary in this box is sold out, a Legendary roll gives an Epic from this box instead.";

export type Challenge = { id: string; period: "day" | "week" | "month"; label: string; vip?: boolean;  hint: string; reward: number; href: string };
/** Built only on app activity the server can see. Never on results, stakes or money. */
export const CHALLENGES: Challenge[] = [
  { id: "d-pick", period: "day", label: "Log a pick", hint: "Track any pick today (signed in).", reward: 10, href: "/lines" },
  { id: "d-position", period: "day", label: "Share a live position", hint: "Put one open pick up for friends.", reward: 10, href: "/lines/portfolio" },
  { id: "d-chat", period: "day", label: "Say something in a squad", hint: "Send one squad chat message.", reward: 10, href: "/friends" },
  { id: "d-react", period: "day", label: "React in squad chat", hint: "Drop an emote on a squad message.", reward: 5, href: "/friends" },
  { id: "d-login", period: "day", label: "Daily check-in", hint: "Open Portal Juice signed in. Builds your streak.", reward: 5, href: "/coins" },
  { id: "d-gamechat", period: "day", label: "Talk in a game", hint: "Send a message in any game chat.", reward: 10, href: "/games" },
  { id: "d-picks3", period: "day", label: "Log 3 picks", hint: "Track three picks today.", reward: 15, href: "/lines" },
  { id: "d-call", period: "day", label: "Call the next score", hint: "Make a next-score call in a live game.", reward: 10, href: "/games" },
  { id: "d-callhit", period: "day", label: "Called it", hint: "Get a next-score call right.", reward: 15, href: "/games" },
  { id: "w-login", period: "week", label: "Check in 5 days", hint: "Daily check-in on 5 days this week.", reward: 40, href: "/coins" },
  { id: "w-pickem", period: "week", label: "Game Day Pick-em", hint: "Make a pick in Game Day Pick-em this week.", reward: 30, href: "/pickem" },
  { id: "x-launch", period: "month", label: "Launch Week drop", hint: "Limited Launch Week tag + 50 coins. Ends Nov 8.", reward: 50, href: "/coins" },
  { id: "m-vip", period: "month", vip: true, label: "VIP monthly drop", hint: "VIP members get 300 coins every month.", reward: 300, href: "/vip" },
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
export function laMonth(d = new Date()): string {
  return laDay(d).slice(0, 7);
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

export const LAUNCH_ENDS = Date.parse("2026-11-09T08:00:00Z");
