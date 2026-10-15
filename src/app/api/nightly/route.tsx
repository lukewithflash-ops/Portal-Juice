import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { parseNightQuery } from "@/lib/nightly";

export const runtime = "nodejs";

let brandFont: Promise<Buffer | null> | null = null;
function loadFont() {
  brandFont ??= readFile(join(process.cwd(), "src/app/api/push/img/Orbitron-Black.ttf")).catch(() => null);
  return brandFont;
}

const COLOR = { W: "#39ff14", L: "#ff3b5c", P: "#f2eee6", O: "#a1a1aa" } as const;

/** The night's W/L/P from the user's own Log, as a 1080x1350 PNG. Counts and leg labels only, no money. */
export async function GET(req: Request) {
  const night = parseNightQuery(new URL(req.url).searchParams);
  if (!night) return new Response("Bad night.", { status: 400 });
  const font = await loadFont();
  const d = new Date(night.date + "T12:00:00Z");
  const label = d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" }).toUpperCase();
  const slot = (word: string, v: number, c: string) => (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 280, padding: "26px 0", borderRadius: 32, border: `4px solid ${c}`, background: "rgba(8,4,16,0.85)", boxShadow: `0 0 36px ${c}` }}>
      <div style={{ display: "flex", fontSize: 150, lineHeight: 1, color: c, textShadow: `0 0 28px ${c}` }}>{v}</div>
      <div style={{ display: "flex", marginTop: 10, fontSize: 30, letterSpacing: 8, color: "#e9e3f5" }}>{word}</div>
    </div>
  );
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", position: "relative", background: "radial-gradient(circle at 50% 38%, #2a0f4a 0%, #12061f 45%, #030306 82%)", color: "#f2eee6", fontFamily: font ? "Orbitron" : undefined }}>
        <div style={{ position: "absolute", left: 190, top: 120, width: 700, height: 700, borderRadius: 999, border: "10px solid #c026ff", boxShadow: "0 0 60px #c026ff, 0 0 140px rgba(124,58,237,0.7), inset 0 0 60px rgba(57,255,20,0.45)" }} />
        <div style={{ display: "flex", marginTop: 64, fontSize: 40, color: "#e879f9", letterSpacing: 6, textShadow: "0 0 18px #c026ff" }}>PORTAL JUICE</div>
        <div style={{ display: "flex", marginTop: 14, fontSize: 28, color: "#a1a1aa", letterSpacing: 6 }}>{label}</div>
        <div style={{ display: "flex", marginTop: 46, padding: "10px 34px", borderRadius: 999, border: "3px solid #39ff14", color: "#39ff14", fontSize: 38, letterSpacing: 10, boxShadow: "0 0 26px rgba(57,255,20,0.7)" }}>NIGHT RESULTS</div>
        <div style={{ display: "flex", marginTop: 70, gap: 40 }}>
          {slot("WON", night.w, COLOR.W)}
          {slot("LOST", night.l, COLOR.L)}
          {slot("PUSH", night.p, COLOR.P)}
        </div>
        <div style={{ display: "flex", flexDirection: "column", marginTop: 56, width: 900, gap: 14 }}>
          {night.rows.map((r, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 22, fontSize: 30 }}>
              <div style={{ display: "flex", width: 56, height: 56, borderRadius: 999, alignItems: "center", justifyContent: "center", background: COLOR[r.r], color: "#05040a", fontSize: 28 }}>{r.r === "O" ? "…" : r.r}</div>
              <div style={{ display: "flex", color: "#f2eee6", fontSize: 26 }}>{r.s}</div>
            </div>
          ))}
          {night.open ? <div style={{ display: "flex", fontSize: 24, color: "#a1a1aa" }}>{night.open} still open</div> : null}
        </div>
        <div style={{ position: "absolute", bottom: 46, display: "flex", fontSize: 26, color: "#c4b5fd", letterSpacing: 4 }}>portaljuice.app</div>
      </div>
    ),
    {
      width: 1080,
      height: 1350,
      fonts: font ? [{ name: "Orbitron", data: font, weight: 900, style: "normal" }] : undefined,
      headers: { "Cache-Control": "public, max-age=300, s-maxage=3600" },
    }
  );
}
