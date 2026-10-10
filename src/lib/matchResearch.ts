import "server-only";
import { finalize, type Fact, type GameResearch, type LegInput, type LegReport, type Point, type TeamResearch } from "@/lib/breakdown";
import { implied } from "@/lib/odds";
import { getMatch, getSportSlate } from "@/lib/sportsFetch";
import { sportLeague, type Entrant } from "@/lib/sports";
import { WIN_LABEL } from "@/lib/winPct";

const pct = (n: number) => `${Math.round(n * 100)}%`;

function recordRate(rec: string | null): { w: number; l: number; rate: number } | null {
  const m = rec?.match(/^(\d+)-(\d+)/);
  if (!m) return null;
  const w = Number(m[1]);
  const l = Number(m[2]);
  return w + l ? { w, l, rate: w / (w + l) } : null;
}

/**
 * Head-to-head legs (tennis, UFC): who wins. Real numbers only: the posted price,
 * ESPN's projection when it has one, career record (UFC), and results earlier in this event (tennis).
 */
export async function matchReport(input: LegInput): Promise<LegReport | null> {
  const league = sportLeague(input.league);
  if (!league || (league.kind !== "tennis" && league.kind !== "fight")) return null;
  const page = await getMatch(input.league, input.gameId).catch(() => null);
  if (!page) return null;
  const m = page.match;
  const side = input.side === "away" ? "away" : "home";
  const me: Entrant = m[side];
  const opp: Entrant = side === "home" ? m.away : m.home;
  const facts: Fact[] = [];
  const pros: Point[] = [];
  const cons: Point[] = [];
  const ml = side === "home" ? m.price?.homeMl : m.price?.awayMl;
  const odds = input.odds ?? (ml && Number.isFinite(Number(ml)) ? Number(ml) : null);
  if (m.price) facts.push({ label: m.price.provider || "Price", value: `${me.short} ${m.price[side === "home" ? "homeMl" : "awayMl"] ?? "—"} · ${opp.short} ${m.price[side === "home" ? "awayMl" : "homeMl"] ?? "—"}` });
  if (m.win) {
    const mine = side === "home" ? m.win.home : m.win.away;
    facts.push({ label: WIN_LABEL[m.win.source], value: `${me.short} ${pct(mine)}` });
    if (mine >= 0.6) pros.push({ text: `${me.short} is ${pct(mine)} to win (${WIN_LABEL[m.win.source]})`, weight: mine >= 0.75 ? 2 : 1 });
    else if (mine <= 0.4) cons.push({ text: `${me.short} is only ${pct(mine)} to win (${WIN_LABEL[m.win.source]})`, weight: mine <= 0.25 ? -2 : -1 });
  }
  if (league.kind === "fight") {
    const a = recordRate(me.record);
    const b = recordRate(opp.record);
    if (me.record) facts.push({ label: `${me.short} record`, value: me.record });
    if (opp.record) facts.push({ label: `${opp.short} record`, value: opp.record });
    if (a && b) {
      const gap = a.rate - b.rate;
      if (Math.abs(gap) >= 0.08) (gap > 0 ? pros : cons).push({ text: `Career win rate ${pct(a.rate)} (${me.record}) vs ${pct(b.rate)} (${opp.record})`, weight: gap > 0 ? 1 : -1 });
      if (a.w + a.l < 6) cons.push({ text: `Only ${a.w + a.l} pro fights on record`, weight: -1 });
    }
  } else {
    // Tennis: results earlier in this tournament from ESPN's board.
    const slate = await getSportSlate(input.league).catch(() => null);
    const tally = (id: string) => {
      let w = 0;
      let l = 0;
      let setsLost = 0;
      for (const x of slate?.matches ?? []) {
        if (x.state !== "post" || x.id === m.id || x.event !== m.event) continue;
        const who = x.home.id === id ? x.home : x.away.id === id ? x.away : null;
        if (!who) continue;
        const other = who === x.home ? x.away : x.home;
        if (who.winner) w++;
        else if (other.winner) l++;
        setsLost += other.sets.filter((s, i) => Number.parseInt(s) > Number.parseInt(who.sets[i] ?? "0")).length;
      }
      return { w, l, setsLost };
    };
    const a = tally(me.id);
    const b = tally(opp.id);
    if (a.w + a.l) facts.push({ label: `${me.short} this event`, value: `${a.w}-${a.l}, ${a.setsLost} set${a.setsLost === 1 ? "" : "s"} lost` });
    if (b.w + b.l) facts.push({ label: `${opp.short} this event`, value: `${b.w}-${b.l}, ${b.setsLost} set${b.setsLost === 1 ? "" : "s"} lost` });
    if (a.w >= 2 && a.setsLost === 0) pros.push({ text: `${me.short} has won ${a.w} matches here without dropping a set`, weight: 1 });
    if (b.w >= 2 && b.setsLost === 0) cons.push({ text: `${opp.short} has won ${b.w} matches here without dropping a set`, weight: -1 });
    if (a.w + a.l && b.w + b.l && a.setsLost !== b.setsLost) {
      const better = a.setsLost < b.setsLost;
      (better ? pros : cons).push({ text: `Sets lost this event: ${me.short} ${a.setsLost}, ${opp.short} ${b.setsLost}`, weight: better ? 1 : -1 });
    }
  }
  if (odds != null) {
    const p = implied(odds);
    facts.push({ label: "Price says", value: `${pct(p)} implied at ${odds > 0 ? "+" : ""}${odds}` });
  }
  return finalize({
    title: `${me.name} to win`,
    sub: `${m.away.short} vs ${m.home.short}${m.event ? ` · ${m.event}` : ""}`,
    league: input.league,
    gameId: input.gameId,
    sameGameKey: `${input.league}/${input.gameId}`,
    facts,
    pros,
    cons,
    implied: odds != null ? implied(odds) : null,
    odds,
    mark: { abbr: me.short, img: me.logo, logo: false },
  });
}

const emptyTeam = (abbr: string): TeamResearch => ({ id: "", abbr, name: abbr, record: null, form: [], ats: null, ppg: null, papg: null, passAllowed: null, rushAllowed: null, batting: null, injuries: [] });

/** A blank game for a player we found without a game in the window: the game log still speaks. */
export function stubGame(league: string, label: string): GameResearch {
  return { league, id: "", label, start: new Date().toISOString(), state: "pre", venue: null, weather: null, indoor: null, odds: null, home: emptyTeam(""), away: emptyTeam(""), pitchers: null };
}
