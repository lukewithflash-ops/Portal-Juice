/* eslint-disable @next/next/no-img-element -- next/og renders plain <img> */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { getLive } from "@/lib/espn";
import { stageColors } from "@/lib/stageColors";
import { leagueById } from "@/lib/slate";
import { sportLeague } from "@/lib/sports";

export const runtime = "nodejs";

const PRO = new Set(["nfl", "nba", "mlb", "nhl", "wnba"]);
const SOCCER = new Set(["epl", "ucl", "laliga", "seriea", "bundesliga", "mls"]);

function logoUrl(league: string, ab: string, tid: string | null): string | null {
  if (PRO.has(league) && ab) return `https://a.espncdn.com/i/teamlogos/${league}/500/${ab.toLowerCase()}.png`;
  if (league.startsWith("ncaa") && tid) return `https://a.espncdn.com/i/teamlogos/ncaa/500/${tid}.png`;
  if (SOCCER.has(league) && tid) return `https://a.espncdn.com/i/teamlogos/soccer/500/${tid}.png`;
  return null;
}

async function inline(url: string | null): Promise<string | null> {
  if (!url) return null;
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(2500), next: { revalidate: 86400 } });
    if (!r.ok || !(r.headers.get("content-type") ?? "").startsWith("image/")) return null;
    const b = Buffer.from(await r.arrayBuffer());
    return `data:${r.headers.get("content-type")};base64,${b.toString("base64")}`;
  } catch {
    return null;
  }
}

let brandFont: Promise<Buffer | null> | null = null;
function loadFont() {
  brandFont ??= readFile(join(process.cwd(), "src/app/api/push/img/Orbitron-Black.ttf")).catch(() => null);
  return brandFont;
}

/** Final score as a 1080x1080 PNG in the neon portal look. Only for finished games, real ESPN score only. */
export async function GET(_req: Request, ctx: { params: Promise<{ league: string; id: string }> }) {
  const { league, id } = await ctx.params;
  const snap = await getLive(league, id).catch(() => null);
  if (!snap || snap.state !== "post" || snap.awayScore == null || snap.homeScore == null) {
    return new Response("No final yet.", { status: 404, headers: { "Cache-Control": "no-store" } });
  }
  const [font, awayLogo, homeLogo] = await Promise.all([
    loadFont(),
    inline(logoUrl(league, snap.awayAbbr, snap.awayId)),
    inline(logoUrl(league, snap.homeAbbr, snap.homeId)),
  ]);
  const ac = stageColors(snap)[0];
  const hc = stageColors(snap)[1];
  const a = Number(snap.awayScore);
  const h = Number(snap.homeScore);
  const leagueName = leagueById(league)?.label ?? sportLeague(league)?.label ?? league.toUpperCase();
  const detail = /final/i.test(snap.detail) ? snap.detail : "Final";
  const side = (abbr: string, name: string | null | undefined, score: string, color: string, logo: string | null, won: boolean) => (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 400 }}>
      <div style={{ display: "flex", width: 190, height: 190, alignItems: "center", justifyContent: "center", borderRadius: 999, background: "rgba(8,4,16,0.85)", border: `4px solid ${color}`, boxShadow: `0 0 40px ${color}` }}>
        {logo ? <img src={logo} width={130} height={130} alt="" /> : <div style={{ display: "flex", fontSize: 56, color }}>{abbr}</div>}
      </div>
      <div style={{ display: "flex", marginTop: 26, fontSize: 46, color, letterSpacing: 4 }}>{abbr}</div>
      <div style={{ display: "flex", fontSize: 24, color: "#c4b5fd", marginTop: 4, maxWidth: 380, textAlign: "center" }}>{(name ?? "").slice(0, 26)}</div>
      <div style={{ display: "flex", marginTop: 18, fontSize: 168, lineHeight: 1, color: won ? "#ffffff" : "#8b80a8", textShadow: won ? `0 0 34px ${color}` : "none" }}>{score}</div>
    </div>
  );
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          position: "relative",
          background: "radial-gradient(circle at 50% 46%, #2a0f4a 0%, #12061f 45%, #030306 80%)",
          color: "#f2eee6",
          fontFamily: font ? "Orbitron" : undefined,
        }}
      >
        {/* Team edges */}
        <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 14, background: ac, boxShadow: `0 0 40px ${ac}` }} />
        <div style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: 14, background: hc, boxShadow: `0 0 40px ${hc}` }} />
        {/* The portal ring */}
        <div style={{ position: "absolute", left: 140, top: 200, width: 800, height: 800, borderRadius: 999, border: "10px solid #c026ff", boxShadow: "0 0 60px #c026ff, 0 0 140px rgba(124,58,237,0.7), inset 0 0 60px rgba(57,255,20,0.45)" }} />
        <div style={{ position: "absolute", left: 190, top: 250, width: 700, height: 700, borderRadius: 999, border: "3px solid rgba(57,255,20,0.55)" }} />
        <div style={{ display: "flex", marginTop: 64, fontSize: 40, color: "#e879f9", letterSpacing: 6, textShadow: "0 0 18px #c026ff" }}>PORTAL JUICE</div>
        <div style={{ display: "flex", marginTop: 14, fontSize: 26, color: "#a1a1aa", letterSpacing: 8 }}>{leagueName.toUpperCase()}</div>
        <div style={{ display: "flex", marginTop: 70, padding: "10px 34px", borderRadius: 999, border: "3px solid #39ff14", color: "#39ff14", fontSize: 40, letterSpacing: 10, boxShadow: "0 0 26px rgba(57,255,20,0.7)" }}>
          {detail.toUpperCase()}
        </div>
        <div style={{ display: "flex", marginTop: 56, alignItems: "flex-start", justifyContent: "center", width: "100%" }}>
          {side(snap.awayAbbr, snap.awayName, snap.awayScore, ac, awayLogo, a > h)}
          <div style={{ display: "flex", marginTop: 300, fontSize: 60, color: "#6b5b8a" }}>@</div>
          {side(snap.homeAbbr, snap.homeName, snap.homeScore, hc, homeLogo, h > a)}
        </div>
        <div style={{ position: "absolute", bottom: 46, display: "flex", fontSize: 26, color: "#c4b5fd", letterSpacing: 4 }}>portaljuice.app</div>
      </div>
    ),
    {
      width: 1080,
      height: 1080,
      fonts: font ? [{ name: "Orbitron", data: font, weight: 900, style: "normal" }] : undefined,
      headers: { "Cache-Control": "public, max-age=300, s-maxage=86400" },
    }
  );
}
