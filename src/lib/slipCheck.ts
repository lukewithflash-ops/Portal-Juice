/**
 * Slip check: real flags before a slip is saved. Pure parts (conflicts inside the slip, duplicates
 * of open picks) live here; the route adds the ESPN injury report, line moves and game state.
 * A flag never blocks saving.
 */

export type CheckLeg = {
  subject: string;
  kind: "prop" | "spread" | "total" | "moneyline";
  market: string;
  line: number | null;
  selection: "Over" | "Under" | null;
  league?: string | null;
  gameId?: string | null;
  athleteId?: string | null;
  side?: "home" | "away" | null;
  /** Filled by the server from the roster: the player's team abbr and position. */
  team?: string | null;
  pos?: string | null;
};

export type Flag = { leg: number; kind: "injury" | "conflict" | "moved" | "started" | "final" | "duplicate"; text: string; other?: number };

const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();
const mk = (m: string) => norm(m).replace(/s$/, "");
const PASS = /pass(ing)? ?(yard|yd|td|touchdown|completion|attempt)|completion/i;
const CATCH = /rec(eiving)? ?(yard|yd)|reception|catches|target/i;

/** Legs that work against each other inside one slip. */
export function conflicts(legs: CheckLeg[]): Flag[] {
  const out: Flag[] = [];
  for (let i = 0; i < legs.length; i++) {
    for (let j = i + 1; j < legs.length; j++) {
      const a = legs[i];
      const b = legs[j];
      const same = a.gameId && b.gameId && a.gameId === b.gameId && a.league === b.league;
      if (same && a.kind === "moneyline" && b.kind === "moneyline" && a.side && b.side && a.side !== b.side)
        out.push({ leg: j, other: i, kind: "conflict", text: "Both teams' moneylines in one game: one of them has to lose." });
      else if (same && a.kind === "spread" && b.kind === "spread" && a.side && b.side && a.side !== b.side)
        out.push({ leg: j, other: i, kind: "conflict", text: "Both sides of the same spread." });
      else if (same && a.kind === "total" && b.kind === "total" && a.selection && b.selection && a.selection !== b.selection)
        out.push({ leg: j, other: i, kind: "conflict", text: "Over and under on the same game total." });
      else if (a.kind === "prop" && b.kind === "prop" && norm(a.subject) === norm(b.subject) && mk(a.market) === mk(b.market) && a.selection && b.selection && a.selection !== b.selection)
        out.push({ leg: j, other: i, kind: "conflict", text: `Over and under on ${a.subject} ${a.market}.` });
      else if (same && a.kind === "prop" && b.kind === "prop" && a.team && a.team === b.team && a.selection && b.selection && a.selection !== b.selection) {
        const qb = PASS.test(a.market) ? a : PASS.test(b.market) ? b : null;
        const wr = qb === a ? b : a;
        if (qb && CATCH.test(wr.market))
          out.push({ leg: j, other: i, kind: "conflict", text: `${qb.selection} on ${qb.subject}'s passing but ${wr.selection?.toLowerCase()} on his receiver ${wr.subject}: those usually move together.` });
      } else if (same && ((a.kind === "moneyline" && b.kind === "spread") || (a.kind === "spread" && b.kind === "moneyline")) && a.side && b.side && a.side !== b.side) {
        const sp = a.kind === "spread" ? a : b;
        if ((sp.line ?? 0) < 0) out.push({ leg: j, other: i, kind: "conflict", text: "A moneyline on one team and the other team to cover as favorite." });
      }
    }
  }
  return out;
}

export type OpenPick = { id: string; subject: string; market?: string; line: number; selection?: "Over" | "Under" | null; gameId?: string; status: string };

/** Legs you already have open in your Log. */
export function duplicates(legs: CheckLeg[], open: OpenPick[]): Flag[] {
  const out: Flag[] = [];
  legs.forEach((l, i) => {
    const hit = open.find(
      (p) =>
        p.status === "open" &&
        norm(p.subject) === norm(l.subject) &&
        mk(p.market ?? "") === mk(l.market) &&
        Math.abs(Number(p.line) - Number(l.line ?? NaN)) < 1e-9 &&
        (p.selection ?? null) === (l.selection ?? null) &&
        (!p.gameId || !l.gameId || p.gameId === l.gameId)
    );
    if (hit) out.push({ leg: i, kind: "duplicate", text: "Already open in your Log." });
  });
  return out;
}
