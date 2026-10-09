/** Quick emotes for live plays. Pure picking + an optional tiny synth (off unless you turn sound on). */
import type { LivePlay, LiveSnap } from "@/lib/live";
import { playKind } from "@/lib/tracker";

export type EmoteKind =
  | "td" | "fg" | "first" | "sack" | "turnover" | "gain"
  | "three" | "dunk" | "block"
  | "hr" | "k" | "hit"
  | "goal" | "save"
  | "score";

export type Emote = { id: string; kind: EmoteKind; label: string; teamId: string | null; bad: boolean };

const LABEL: Record<EmoteKind, string> = {
  td: "Touchdown", fg: "It’s good", first: "1st down", sack: "Sacked", turnover: "Turnover", gain: "Big gain",
  three: "Splash", dunk: "Slam", block: "Rejected", hr: "Gone", k: "K", hit: "Base hit", goal: "Goal", save: "Save", score: "Score",
};

const PRIORITY: EmoteKind[] = ["td", "goal", "hr", "turnover", "fg", "sack", "dunk", "three", "block", "k", "save", "gain", "first", "hit", "score"];

/** Which emote one play earns, or null. */
export function emoteOf(league: string, p: LivePlay): EmoteKind | null {
  const t = `${p.typeText} ${p.text}`.toLowerCase();
  const football = league === "nfl" || league === "ncaaf";
  const k = playKind(p);
  if (football) {
    if (k === "td") return "td";
    if (k === "fg" && /field goal/.test(t)) return "fg";
    if (k === "pick" || k === "turnover" || p.turnover) return "turnover";
    if (k === "sack") return "sack";
    if (!p.penalty && (p.yards ?? 0) >= 20) return "gain";
    if (!p.penalty && p.yards != null && p.distance != null && p.distance > 0 && p.yards >= p.distance && !p.scoring) return "first";
    return null;
  }
  if (league === "mlb") {
    if (/home run|homers|homered/.test(t)) return "hr";
    if (/strikes out|struck out|called out on strikes/.test(t)) return "k";
    if (k === "hit") return "hit";
    if (p.scoring) return "score";
    return null;
  }
  if (league === "nhl") {
    if (k === "goal" || (p.scoring && /goal/.test(t))) return "goal";
    if (k === "save") return "save";
    return null;
  }
  // Basketball
  if (k === "dunk") return "dunk";
  if (k === "three") return "three";
  if (k === "block") return "block";
  return null;
}

/** The loudest emote among the new plays. Football first downs also read off the posted down changing to 1st. */
export function pickEmote(league: string, added: LivePlay[], prev: LiveSnap | null, next: LiveSnap): Emote | null {
  let best: { kind: EmoteKind; play: LivePlay } | null = null;
  for (const p of added) {
    const kind = emoteOf(league, p);
    if (!kind) continue;
    if (!best || PRIORITY.indexOf(kind) < PRIORITY.indexOf(best.kind)) best = { kind, play: p };
  }
  if (!best && (league === "nfl" || league === "ncaaf") && added.length) {
    const a = prev?.situation;
    const b = next.situation;
    if (a && b && b.down === 1 && a.down !== 1 && a.teamId === b.teamId) {
      const last = added[added.length - 1];
      best = { kind: "first", play: last };
    }
  }
  if (!best) return null;
  const bad = best.kind === "sack" || best.kind === "turnover";
  return { id: best.play.id, kind: best.kind, label: LABEL[best.kind], teamId: best.play.teamId, bad };
}

/** A final game as it stood after `n` plays, for the replay. Only real plays and their posted scores. */
export function replaySnap(snap: LiveSnap, n: number): LiveSnap {
  const plays = snap.plays.slice(0, Math.max(0, n));
  const last = [...plays].reverse().find((p) => p.awayScore !== null && p.homeScore !== null);
  const keep = new Set(plays.map((p) => p.id));
  const drives = snap.drives
    .map((d) => ({ ...d, playIds: d.playIds.filter((id) => keep.has(id)), live: false }))
    .filter((d) => d.playIds.length);
  if (drives.length) drives[drives.length - 1] = { ...drives[drives.length - 1], live: true };
  const lp = plays[plays.length - 1];
  const win = snap.win.slice(0, Math.max(1, Math.round((snap.win.length * plays.length) / Math.max(1, snap.plays.length))));
  return {
    ...snap,
    state: "in",
    plays,
    drives,
    win,
    awayScore: last ? String(last.awayScore) : "0",
    homeScore: last ? String(last.homeScore) : "0",
    clock: lp?.clock ?? null,
    period: lp ? Number(lp.period) || snap.period : snap.period,
    detail: lp ? `Replay · ${lp.period ? "P" + lp.period : ""} ${lp.clock ?? ""}`.trim() : "Replay",
    situation:
      lp && lp.down && lp.yardsToEndzone !== null
        ? { down: lp.down, distance: lp.distance, yardsToEndzone: lp.yardsToEndzone, text: lp.downText ?? null, short: null, spot: lp.spot, teamId: lp.teamId, redZone: lp.yardsToEndzone <= 20, source: "play" }
        : null,
    bug: null,
  };
}

// ---------- Sound (opt-in) ----------
const SOUND_KEY = "pj-sound";
export function soundOn(): boolean {
  try {
    return localStorage.getItem(SOUND_KEY) === "on";
  } catch {
    return false;
  }
}
export function setSound(on: boolean) {
  localStorage.setItem(SOUND_KEY, on ? "on" : "off");
}

let ctx: AudioContext | null = null;
const TUNE: Partial<Record<EmoteKind, number[]>> = {
  td: [523, 659, 784, 1047], goal: [440, 440, 660], hr: [392, 523, 784], fg: [523, 784], three: [880, 1175], dunk: [196, 147],
  sack: [220, 165], turnover: [247, 185], block: [180], k: [660, 440], save: [330, 494], gain: [587, 784], first: [659, 880], hit: [523], score: [587, 740],
};
export function playSound(kind: EmoteKind) {
  if (typeof window === "undefined" || !soundOn()) return;
  try {
    ctx = ctx ?? new AudioContext();
    const notes = TUNE[kind] ?? [660];
    notes.forEach((f, i) => {
      const o = ctx!.createOscillator();
      const g = ctx!.createGain();
      const at = ctx!.currentTime + i * 0.09;
      o.type = kind === "goal" ? "sawtooth" : "triangle";
      o.frequency.setValueAtTime(f, at);
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(0.12, at + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, at + 0.16);
      o.connect(g).connect(ctx!.destination);
      o.start(at);
      o.stop(at + 0.18);
    });
  } catch {
    /* no audio */
  }
}
