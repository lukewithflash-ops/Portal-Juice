/** Tips and "your betting style" from the Log. Real counts only; W/L/P, never money. Pure. */
import { pickKind } from "@/lib/ledger";
import { statType, tally, type Tally } from "@/lib/myStats";
import type { Pick } from "@/lib/types";

export type Split = { label: string; t: Tally };
const MIN = 5;
const rec = (t: Tally) => `${t.w}-${t.l}${t.p ? `-${t.p}` : ""}`;
const pct = (t: Tally) => (t.pct == null ? "—" : `${Math.round(t.pct)}%`);
export const fmtSplit = (s: Split) => `${s.label} ${rec(s.t)} (${pct(s.t)})`;

const settled = (ps: Pick[]) => ps.filter((p) => p.status === "win" || p.status === "loss" || p.status === "push");
const decided = (t: Tally) => t.w + t.l;

/** Slip size per pick: how many legs share its slipId. */
function slipSizes(ps: Pick[]): Map<string, number> {
  const n = new Map<string, number>();
  for (const p of ps) if (p.slipId) n.set(p.slipId, (n.get(p.slipId) ?? 0) + 1);
  return n;
}

/** Whole slips: W when every decided leg won, L when any leg lost. Only fully settled slips. */
export function slipRecord(ps: Pick[], minLegs: number): Tally {
  const by = new Map<string, Pick[]>();
  for (const p of ps) if (p.slipId) by.set(p.slipId, [...(by.get(p.slipId) ?? []), p]);
  let w = 0, l = 0, pu = 0;
  for (const legs of by.values()) {
    if (legs.length < minLegs || legs.some((x) => x.status === "open")) continue;
    if (legs.some((x) => x.status === "loss")) l++;
    else if (legs.every((x) => x.status === "push")) pu++;
    else w++;
  }
  return { w, l, p: pu, open: 0, pct: w + l ? Math.round((w / (w + l)) * 1000) / 10 : null };
}

/** Picks logged within 3 hours after a loss (by createdAt). */
function afterLoss(ps: Pick[]): Pick[] {
  const losses = ps.filter((p) => p.status === "loss").map((p) => Date.parse(p.createdAt)).filter(Number.isFinite);
  return ps.filter((p) => {
    const t = Date.parse(p.createdAt);
    return Number.isFinite(t) && losses.some((x) => t > x && t - x <= 3 * 3600_000);
  });
}

export function splits(ps: Pick[]): Split[] {
  const done = settled(ps);
  const out: Split[] = [];
  const add = (label: string, list: Pick[]) => out.push({ label, t: tally(list) });
  const group = (key: (p: Pick) => string | null, fmt: (k: string) => string) => {
    const m = new Map<string, Pick[]>();
    for (const p of done) {
      const k = key(p);
      if (k) m.set(k, [...(m.get(k) ?? []), p]);
    }
    for (const [k, list] of m) add(fmt(k), list);
  };
  group((p) => p.sport, (k) => k);
  group(statType, (k) => k);
  group((p) => (p.selection === "Over" ? "Overs" : p.selection === "Under" ? "Unders" : null), (k) => k);
  group((p) => (pickKind(p) === "prop" ? "Props" : "Team picks"), (k) => k);
  group((p) => (Math.abs(p.odds) >= 100 ? (p.odds < 0 ? "Favorites (minus price)" : "Underdogs (plus price)") : null), (k) => k);
  const sizes = slipSizes(ps);
  group((p) => {
    const n = p.slipId ? sizes.get(p.slipId) ?? 1 : 1;
    return n >= 4 ? "Legs in 4+ leg slips" : n >= 2 ? "Legs in 2-3 leg slips" : "Single picks";
  }, (k) => k);
  const big = slipRecord(ps, 4);
  if (decided(big) >= MIN) out.push({ label: "4+ leg slips", t: big });
  const tilt = settled(afterLoss(ps));
  if (tilt.length) add("Picks logged within 3h of a loss", tilt);
  return out.filter((s) => decided(s.t) >= MIN);
}

export type Style = { enough: boolean; need: number; summary: string; pros: Split[]; cons: Split[]; warnings: string[] };

export function styleReport(ps: Pick[]): Style {
  const done = settled(ps);
  const dec = done.filter((p) => p.status !== "push").length;
  const need = Math.max(0, 10 - dec);
  if (need > 0) return { enough: false, need, summary: "", pros: [], cons: [], warnings: [] };
  const all = tally(ps);
  const sp = splits(ps);
  const ranked = [...sp].sort((a, b) => (b.t.pct ?? 0) - (a.t.pct ?? 0));
  const base = all.pct ?? 50;
  const pros = ranked.filter((s) => (s.t.pct ?? 0) >= Math.max(52, base)).slice(0, 4);
  const cons = [...ranked].reverse().filter((s) => (s.t.pct ?? 100) < Math.min(50, base) && !pros.includes(s)).slice(0, 4);
  const warnings: string[] = [];
  const thin = sp.filter((s) => decided(s.t) < 10).length;
  if (thin) warnings.push(`${thin} of these splits have under 10 decided picks. Small samples swing hard.`);
  const tilt = sp.find((s) => s.label.startsWith("Picks logged within"));
  if (tilt && (tilt.t.pct ?? 100) < base) warnings.push(`After a loss you're ${rec(tilt.t)} (${pct(tilt.t)}). Slow down after a miss.`);
  const unders = sp.find((s) => s.label === "Unders");
  const overs = sp.find((s) => s.label === "Overs");
  const props = done.filter((p) => pickKind(p) === "prop").length;
  const lean = unders && overs ? (decided(unders.t) > decided(overs.t) ? "Under-leaning" : "Over-leaning") : overs ? "Over-leaning" : unders ? "Under-leaning" : "Balanced";
  const kind = props >= done.length / 2 ? "prop player" : "team-side player";
  const bestStat = ranked.find((s) => s.label === s.label.toLowerCase() && s.label.length > 3 && (s.t.pct ?? 0) > base);
  const summary = `${lean} ${kind}${bestStat ? `, strongest on ${bestStat.label}` : ""}.`;
  return { enough: true, need: 0, summary: summary[0].toUpperCase() + summary.slice(1), pros, cons, warnings };
}

export const GENERAL_TIPS = [
  "Check minutes and injury news before you lock a prop.",
  "Line moved? Ask why. Late money and injuries move numbers.",
  "Correlated legs (QB yards + his WR) rise and fall together.",
  "Every leg you add makes the slip harder to hit.",
  "After a loss, don't make the next slip bigger.",
  "Blowout risk cuts starters' minutes. Watch spreads over 10.",
  "Hit rate over the last 10 beats a hunch.",
  "Pace matters: fast games mean more shots and more stats.",
  "Weather hits passing and kicking first.",
  "One bad matchup can sink a hot player. Check the defense rank.",
];

export function personalTips(ps: Pick[]): string[] {
  const sp = splits(ps);
  const out: string[] = [];
  const get = (l: string) => sp.find((s) => s.label === l);
  const u = get("Unders"), o = get("Overs");
  if (u && o && u.t.pct != null && o.t.pct != null && Math.abs(u.t.pct - o.t.pct) >= 8)
    out.push(`Your unders hit ${pct(u.t)} vs overs ${pct(o.t)}.`);
  const stats = sp.filter((s) => s.label === s.label.toLowerCase() && !["Overs", "Unders"].includes(s.label)).sort((a, b) => (b.t.pct ?? 0) - (a.t.pct ?? 0));
  if (stats[0]) out.push(`Your best stat is ${stats[0].label}, ${rec(stats[0].t)}.`);
  if (stats.length > 1) {
    const w = stats[stats.length - 1];
    if ((w.t.pct ?? 100) < 50) out.push(`${w.label[0].toUpperCase() + w.label.slice(1)} is your toughest stat: ${rec(w.t)}.`);
  }
  const big = get("4+ leg slips");
  if (big) out.push(`You're ${rec(big.t)} on 4+ leg slips.`);
  const tilt = get("Picks logged within 3h of a loss");
  if (tilt) out.push(`Within 3 hours of a loss you're ${rec(tilt.t)}.`);
  const fav = get("Favorites (minus price)"), dog = get("Underdogs (plus price)");
  if (fav && dog) out.push(`Minus prices ${rec(fav.t)}, plus prices ${rec(dog.t)}.`);
  return out;
}

/** Mixed deck: personal first-class when they exist, plus evergreen. */
export function tipDeck(ps: Pick[]): { text: string; mine: boolean }[] {
  return [...personalTips(ps).map((text) => ({ text, mine: true })), ...GENERAL_TIPS.map((text) => ({ text, mine: false }))];
}

const STAT_TIP: [RegExp, string][] = [
  [/longest\s+rush/, "One big run decides it. Check carries and the run-game role."],
  [/longest\s+(reception|catch)/, "One deep catch decides it. Check targets and air yards."],
  [/longest\s+(completion|pass)/, "One shot play decides it. Check deep-ball rate and protection."],
  [/fantasy/, "Fantasy score stacks every stat. Volume (minutes, touches) drives it."],
  [/\+/, "Combos need every piece. One quiet stat can sink it."],
  [/rebound/, "Rebounds follow minutes and the other team's misses. Check pace."],
  [/assist/, "Assists need teammates to hit shots. Check who's out."],
  [/three|3-?p/, "Threes swing hard game to game. Look at attempts, not makes."],
  [/^points|^pts/, "Points follow minutes and shots. Blowouts cut both."],
  [/passing yards/, "Check pace, weather, and whether his team is likely to lead."],
  [/rushing yards|rush attempts/, "Rushing yards follow carries. Game script matters: leading teams run."],
  [/receiving yards|receptions|targets/, "Targets drive catches. Check the target share and who's out."],
  [/strikeout/, "Strikeouts follow pitch count and the lineup's K rate."],
  [/hits|total bases|home run/, "Check the pitcher matchup and where he bats in the order."],
  [/shots|sog/, "Shots follow ice time and power-play role."],
  [/goal/, "Goals are rare and swingy. Shots tell the real story."],
  [/save/, "Saves follow shots against. A strong opponent offense helps."],
];

export function statTip(market: string): string | null {
  const m = market.toLowerCase().trim();
  if (!m) return null;
  return STAT_TIP.find(([re]) => re.test(m))?.[1] ?? null;
}

/** Your own record on a stat type, if you've logged any settled. */
export function statRecord(ps: Pick[], market: string): string | null {
  const m = market.toLowerCase().trim();
  const t = tally(settled(ps).filter((p) => (p.market ?? "").toLowerCase().trim() === m));
  return t.w + t.l + t.p ? `You're ${rec(t)} on ${m}${t.pct != null ? ` (${pct(t)})` : ""}.` : null;
}
