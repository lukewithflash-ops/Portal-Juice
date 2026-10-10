/* eslint-disable @next/next/no-img-element -- next/og renders plain <img> */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";

export const runtime = "nodejs";

const HEADSHOT: Record<string, string> = { nfl: "nfl", nba: "nba", mlb: "mlb", nhl: "nhl", wnba: "wnba", ncaaf: "college-football", ncaam: "mens-college-basketball", ncaaw: "womens-college-basketball" };
const PRO = new Set(["nfl", "nba", "mlb", "nhl", "wnba"]);
const SOCCER = new Set(["epl", "ucl", "laliga", "seriea", "bundesliga", "mls"]);

const hex = (v: string | null, f: string) => (v && /^[0-9a-fA-F]{6}$/.test(v) ? `#${v}` : f);
const word = (v: string | null, n: number) => (v ?? "").replace(/[^\p{L}\p{N} .'+\-·:@!]/gu, "").slice(0, n);
const id = (v: string | null) => (v && /^\d{1,12}$/.test(v) ? v : null);
const abbr = (v: string | null) => (v ?? "").replace(/[^A-Za-z0-9]/g, "").slice(0, 5);

function logoUrl(league: string, ab: string, tid: string | null): string | null {
  if (PRO.has(league) && ab) return `https://a.espncdn.com/i/teamlogos/${league}/500/${ab.toLowerCase()}.png`;
  if (league.startsWith("ncaa") && tid) return `https://a.espncdn.com/i/teamlogos/ncaa/500/${tid}.png`;
  if (SOCCER.has(league) && tid) return `https://a.espncdn.com/i/teamlogos/soccer/500/${tid}.png`;
  return null;
}

/** ESPN image as a data URL, or null. Never lets a missing image break the image. */
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

/** The rich push image: dark portal gradient, glowing ring, team colors, score or player meter. 1200x600. */
// Brand display face (Orbitron Black, SIL OFL), read once per instance.
let brandFont: Promise<Buffer | null> | null = null;
function loadFont() {
  brandFont ??= readFile(join(process.cwd(), "src/app/api/push/img/Orbitron-Black.ttf")).catch(() => null);
  return brandFont;
}

export async function GET(req: Request) {
  const font = await loadFont();
  const q = new URL(req.url).searchParams;
  const league = (q.get("lg") ?? "").replace(/[^a-z0-9]/g, "").slice(0, 12);
  const kind = (q.get("k") ?? "").replace(/[^a-z]/g, "").slice(0, 10);
  const emoji = [...(q.get("e") ?? "🟣")].slice(0, 3).join("");
  const title = word(q.get("t"), 60);
  const a = abbr(q.get("a"));
  const h = abbr(q.get("h"));
  const as = word(q.get("as"), 3);
  const hs = word(q.get("hs"), 3);
  const ac = hex(q.get("ac"), "#7C3AED");
  const hc = hex(q.get("hc"), "#F5C542");
  const detail = word(q.get("d"), 30);
  const player = word(q.get("p"), 40);
  const pid = id(q.get("pid"));
  const value = q.get("v") != null && Number.isFinite(Number(q.get("v"))) ? Number(q.get("v")) : null;
  const line = q.get("l") != null && Number.isFinite(Number(q.get("l"))) ? Number(q.get("l")) : null;
  const market = word(q.get("mk"), 20);
  const under = q.get("sd") === "Under";
  // Live tile: up to 3 prop meters "name~value~line~O|U", joined by "|".
  const meters = (q.get("ms") ?? "")
    .split("|")
    .filter(Boolean)
    .slice(0, 3)
    .map((x) => {
      const [n, v, l, sd] = x.split("~");
      const val = Number(v);
      const ln = Number(l);
      return { name: word(n, 22), value: Number.isFinite(val) && v !== "" ? val : null, line: Number.isFinite(ln) ? ln : 0, under: sd === "U" };
    })
    .filter((m) => m.name && m.line > 0);
  const hit = kind === "cleared";
  const ring = hit ? "#F5C542" : kind === "final" ? "#f2eee6" : ac;

  const [aLogo, hLogo, face] = await Promise.all([
    inline(logoUrl(league, a, id(q.get("ai")))),
    inline(logoUrl(league, h, id(q.get("hi")))),
    pid && HEADSHOT[league] ? inline(`https://a.espncdn.com/i/headshots/${HEADSHOT[league]}/players/full/${pid}.png`) : Promise.resolve(null),
  ]);
  const fill = value != null && line ? Math.max(4, Math.min(100, (value / line) * 100)) : 0;
  const meterColor = hit ? "#F5C542" : under ? (value != null && line != null && value < line ? "#34d399" : "#f87171") : fill >= 100 ? "#F5C542" : "#34d399";

  const side = (logo: string | null, ab: string, sc: string, color: string) => (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 300 }}>
      <div style={{ display: "flex", width: 150, height: 150, borderRadius: 999, alignItems: "center", justifyContent: "center", background: `${color}33`, boxShadow: `0 0 60px ${color}` }}>
        {logo ? <img src={logo} width={120} height={120} alt="" /> : <div style={{ display: "flex", fontSize: 54, fontWeight: 900, color: "#f2eee6" }}>{ab}</div>}
      </div>
      <div style={{ display: "flex", marginTop: 10, fontSize: 34, fontWeight: 800, color: "#d4d4d8" }}>{ab}</div>
      {sc ? <div style={{ display: "flex", fontSize: 110, fontWeight: 900, color: "#ffffff", lineHeight: 1 }}>{sc}</div> : null}
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
          background: `radial-gradient(circle at 50% 45%, ${ring}55 0%, #1a0b2e 38%, #030306 75%)`,
          color: "#f2eee6",
          position: "relative",
          padding: 36,
          fontFamily: font ? "Orbitron" : undefined,
        }}
      >
        {["big", "cleared", "final", "lead", "player"].includes(kind) ? (
          [[110, 120, 46, "#F5C542"], [1040, 100, 38, "#A855F7"], [180, 430, 30, "#39FF14"], [980, 420, 50, "#F5C542"], [600, 40, 28, "#C084FC"], [80, 280, 24, "#A855F7"], [1110, 300, 26, "#39FF14"]].map(([x, y, sz, c], n) => (
            <div key={n} style={{ position: "absolute", left: Number(x), top: Number(y), display: "flex", fontSize: Number(sz), color: String(c), textShadow: `0 0 18px ${c}` }}>
              ✨
            </div>
          ))
        ) : null}
        <div style={{ position: "absolute", left: 0, top: 0, width: 14, height: "100%", background: ac, boxShadow: `0 0 40px ${ac}` }} />
        <div style={{ position: "absolute", right: 0, top: 0, width: 14, height: "100%", background: hc, boxShadow: `0 0 40px ${hc}` }} />
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 28, fontWeight: 800, color: "#c4b5fd" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ display: "flex", width: 36, height: 36, borderRadius: 999, border: "6px solid #a855f7", boxShadow: "0 0 18px #a855f7" }} />
            PORTAL JUICE
          </div>
          <div style={{ display: "flex", color: "#e4e4e7" }}>{detail}</div>
        </div>
        <div style={{ display: "flex", flex: 1, alignItems: "center", justifyContent: "center", position: "relative" }}>
          {player ? (
            <div style={{ display: "flex", alignItems: "center", gap: 48 }}>
              <div style={{ display: "flex", width: 300, height: 300, borderRadius: 999, border: `14px solid ${ring}`, boxShadow: `0 0 80px ${ring}, inset 0 0 40px ${ring}`, alignItems: "flex-end", justifyContent: "center", overflow: "hidden", background: "#0b0614" }}>
                {face ? <img src={face} width={300} height={218} alt="" style={{ objectFit: "cover" }} /> : <div style={{ display: "flex", fontSize: 120, alignSelf: "center" }}>{emoji}</div>}
              </div>
              <div style={{ display: "flex", flexDirection: "column", width: 640 }}>
                <div style={{ display: "flex", fontSize: 72, fontWeight: 900, lineHeight: 1.05 }}>{`${emoji} ${hit ? "Hit!" : ""}`}</div>
                <div style={{ display: "flex", fontSize: 56, fontWeight: 900 }}>{player}</div>
                {line != null ? (
                  <div style={{ display: "flex", flexDirection: "column", marginTop: 18 }}>
                    <div style={{ display: "flex", fontSize: 44, fontWeight: 800, color: meterColor }}>{`${value ?? "—"} of ${line} ${market}`}</div>
                    <div style={{ display: "flex", marginTop: 12, width: 600, height: 26, borderRadius: 99, background: "#27272a" }}>
                      <div style={{ display: "flex", width: `${fill}%`, height: 26, borderRadius: 99, background: meterColor, boxShadow: `0 0 24px ${meterColor}` }} />
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 20 }}>
              {side(aLogo, a, as, ac)}
              <div style={{ display: "flex", width: 260, height: 260, borderRadius: 999, border: `16px solid ${ring}`, boxShadow: `0 0 90px ${ring}, inset 0 0 50px ${ring}`, alignItems: "center", justifyContent: "center", fontSize: [...emoji].length > 1 ? 84 : 120 }}>{emoji}</div>
              {side(hLogo, h, hs, hc)}
            </div>
          )}
        </div>
        {meters.length ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: "0 40px" }}>
            {meters.map((m) => {
              const pct = m.value == null ? 0 : Math.max(0, Math.min(100, (m.value / m.line) * 100));
              const done = m.value != null && (m.under ? false : m.value > m.line);
              const c = done ? "#F5C542" : m.under ? (m.value != null && m.value > m.line ? "#FF3B5C" : "#39FF14") : "#A855F7";
              return (
                <div key={m.name} style={{ display: "flex", alignItems: "center", gap: 18 }}>
                  <div style={{ display: "flex", width: 330, fontSize: 32, fontWeight: 800 }}>{m.name}</div>
                  <div style={{ display: "flex", flex: 1, height: 22, borderRadius: 99, background: "#1f1530", border: "2px solid #4c1d95" }}>
                    <div style={{ display: "flex", width: `${pct}%`, height: 18, borderRadius: 99, background: c, boxShadow: `0 0 20px ${c}` }} />
                  </div>
                  <div style={{ display: "flex", width: 190, justifyContent: "flex-end", fontSize: 32, fontWeight: 900, color: c }}>{`${m.value ?? "—"}/${m.line}`}</div>
                </div>
              );
            })}
          </div>
        ) : (
          <div style={{ display: "flex", justifyContent: "center", fontSize: 46, fontWeight: 900, textAlign: "center" }}>{title}</div>
        )}
      </div>
    ),
    { width: 1200, height: 600, emoji: "twemoji", fonts: font ? [{ name: "Orbitron", data: font, weight: 900, style: "normal" }] : undefined, headers: { "Cache-Control": "public, max-age=86400, immutable" } }
  );
}
