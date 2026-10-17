import { NextResponse } from "next/server";
import { getGameDetail } from "@/lib/espn";
import { gameRoster } from "@/lib/research";
import { leagueById } from "@/lib/slate";
import { nameClose } from "@/lib/slipImport";
import { statFromMarket } from "@/lib/breakdown";
import { conflicts, type CheckLeg, type Flag } from "@/lib/slipCheck";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const num = (s: string | null | undefined) => {
  const m = /-?\d+(?:\.\d+)?/.exec(s ?? "");
  return m ? Number(m[0]) : null;
};

/**
 * POST { legs } → { flags }. Real data only: ESPN injury report, the posted line vs its open,
 * game state, and conflicts inside the slip. Never blocks saving.
 */
export async function POST(req: Request) {
  let body: { legs?: CheckLeg[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }
  const legs = (Array.isArray(body.legs) ? body.legs : []).slice(0, 20).map((l) => ({ ...l, subject: String(l.subject ?? "").slice(0, 60), market: String(l.market ?? "").slice(0, 40) }));
  const flags: Flag[] = [];
  const games = new Map<string, Awaited<ReturnType<typeof getGameDetail>>>();
  const rosters = new Map<string, Awaited<ReturnType<typeof gameRoster>>>();
  const keys = [...new Set(legs.filter((l) => l.league && l.gameId && leagueById(l.league)).map((l) => `${l.league}/${l.gameId}`))];
  await Promise.all(
    keys.map(async (k) => {
      const [lg, id] = k.split("/");
      const [d, r] = await Promise.all([getGameDetail(lg, id).catch(() => null), gameRoster(lg, id).catch(() => null)]);
      games.set(k, d);
      if (r) rosters.set(k, r);
    })
  );
  legs.forEach((l, i) => {
    const k = `${l.league}/${l.gameId}`;
    const b = games.get(k);
    if (!b) return;
    if (b.game.state === "post") flags.push({ leg: i, kind: "final", text: `Game is final (${b.game.away.abbr} @ ${b.game.home.abbr}).` });
    else if (b.game.state === "in") flags.push({ leg: i, kind: "started", text: `Game already started: ${b.game.detail || "live"}.` });
    if (l.kind === "prop") {
      const ro = rosters.get(k);
      const me = ro?.players.find((p) => (l.athleteId && p.id === l.athleteId) || nameClose(p.name, l.subject));
      if (me) {
        l.team = me.team;
        l.pos = me.pos;
      }
      const inj = b.detail.injuries.find((x) => nameClose(x.name, l.subject));
      if (inj) flags.push({ leg: i, kind: "injury", text: `${inj.name} is on the ESPN injury report: ${inj.status}.` });
      const stat = statFromMarket(l.league ?? "", l.market);
      const posted = b.props.find((p) => (l.athleteId ? p.athleteId === l.athleteId : nameClose(p.name, l.subject)) && stat && statFromMarket(l.league ?? "", p.market) === stat);
      const now = num(posted?.line);
      const open = num(posted?.openLine);
      if (posted && now != null && open != null && now !== open)
        flags.push({ leg: i, kind: "moved", text: `${posted.provider || b.propProvider || "Book"} line moved since open: ${open} → ${now}${l.line != null && l.line !== now ? ` (yours ${l.line})` : ""}.` });
    } else {
      const m = b.detail.move;
      if (m && l.kind === "total" && m.total != null && m.totalOpen != null && m.total !== m.totalOpen)
        flags.push({ leg: i, kind: "moved", text: `${m.provider} total moved since open: ${m.totalOpen} → ${m.total}.` });
      if (m && l.kind === "spread" && m.spreadHome != null && m.spreadHomeOpen != null && m.spreadHome !== m.spreadHomeOpen)
        flags.push({ leg: i, kind: "moved", text: `${m.provider} spread moved since open: ${b.game.home.abbr} ${m.spreadHomeOpen} → ${m.spreadHome}.` });
      if (m && l.kind === "moneyline" && l.side) {
        const now = l.side === "home" ? m.homeMl : m.awayMl;
        const open = l.side === "home" ? m.homeMlOpen : m.awayMlOpen;
        if (now && open && now !== open) flags.push({ leg: i, kind: "moved", text: `${m.provider} moneyline moved since open: ${open} → ${now}.` });
      }
    }
  });
  flags.push(...conflicts(legs));
  return NextResponse.json({ flags }, { headers: { "cache-control": "no-store" } });
}
