import { ImageResponse } from "next/og";

function hex(raw: string | null, fallback: string): string {
  return raw && /^[0-9a-fA-F]{6}$/.test(raw) ? raw : fallback;
}

/** Team-colored Juice mark. Used by the manifest and the home-screen icon. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const size = Number(url.searchParams.get("size") || "192");
  const s = size === 180 || size === 192 || size === 512 ? size : 192;
  const color = hex(url.searchParams.get("color"), "7C3AED");
  const alt = hex(url.searchParams.get("alt"), "F5C542");
  const abbr = (url.searchParams.get("abbr") || "PJ").replace(/[^A-Za-z0-9]/g, "").slice(0, 4).toUpperCase() || "PJ";
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#030306",
        }}
      >
        <div
          style={{
            width: "82%",
            height: "82%",
            borderRadius: "50%",
            border: `${Math.max(8, Math.round(s / 28))}px solid #${color}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: `0 0 ${Math.round(s / 10)}px #${color}`,
          }}
        >
          <div
            style={{
              width: "68%",
              height: "68%",
              borderRadius: "50%",
              border: `${Math.max(4, Math.round(s / 48))}px solid #${alt}`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#f2eee6",
              fontSize: Math.round(s * (abbr.length > 3 ? 0.16 : 0.2)),
              fontWeight: 900,
              letterSpacing: "-0.04em",
            }}
          >
            {abbr}
          </div>
        </div>
      </div>
    ),
    { width: s, height: s }
  );
}
