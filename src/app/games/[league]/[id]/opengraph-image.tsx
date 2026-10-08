import { ImageResponse } from "next/og";
import { getGame } from "@/lib/espn";

export const alt = "Portal Juice";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image({ params }: { params: Promise<{ league: string; id: string }> }) {
  const { league, id } = await params;
  const game = await getGame(league, id);
  const matchup = game ? `${game.away.abbr}  @  ${game.home.abbr}` : "Game";
  const total = game?.price?.total;
  const provider = game?.price?.provider;
  const spread = game?.price?.spreadDetail;
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#030306",
          color: "#f2eee6",
          padding: "64px",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", fontSize: 36, fontWeight: 800, color: "#e879f9" }}>Portal Juice</div>
          <div style={{ display: "flex", fontSize: 22, letterSpacing: 4, textTransform: "uppercase", color: "#a1a1aa" }}>
            {game?.leagueLabel ?? "Lines"}
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", fontSize: 92, fontWeight: 800, letterSpacing: -2 }}>{matchup}</div>
          <div style={{ display: "flex", marginTop: 12, fontSize: 28, color: "#a1a1aa" }}>The number moved.</div>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", fontSize: 22, letterSpacing: 3, textTransform: "uppercase", color: "#a1a1aa" }}>
              Total
            </div>
            <div style={{ display: "flex", fontSize: 84, fontWeight: 800, color: total != null ? "#39ff14" : "#a1a1aa" }}>
              {total != null ? String(total) : "No total posted"}
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", fontSize: 26, color: "#d4d4d8" }}>
            <div style={{ display: "flex" }}>{spread || ""}</div>
            <div style={{ display: "flex", marginTop: 8, color: "#a1a1aa" }}>{provider || "ESPN"}</div>
          </div>
        </div>
      </div>
    ),
    { ...size }
  );
}
