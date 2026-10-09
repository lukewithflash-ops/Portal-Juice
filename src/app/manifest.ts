import type { MetadataRoute } from "next";
import { cookies } from "next/headers";
import { parseTeamCookie } from "@/lib/team";
import { SITE_NAME } from "@/lib/site";

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const jar = await cookies();
  const team = parseTeamCookie(jar.get("pj-team")?.value);
  const q = team
    ? `color=${team.color}&alt=${team.alt}&abbr=${encodeURIComponent(team.abbr)}`
    : "";
  const icons: MetadataRoute.Manifest["icons"] = team
    ? [
        { src: `/api/icon?${q}&size=192`, sizes: "192x192", type: "image/png", purpose: "any" },
        { src: `/api/icon?${q}&size=512`, sizes: "512x512", type: "image/png", purpose: "maskable" },
      ]
    : [
        { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
        { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
        { src: "/icons/icon-512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      ];
  return {
    name: "Portal Juice",
    short_name: SITE_NAME,
    description: "The number moved. Lines, juice, streaks. Not a book.",
    start_url: "/lines",
    scope: "/",
    display: "standalone",
    background_color: "#030306",
    theme_color: team ? `#${team.color}` : "#030306",
    icons,
  };
}
