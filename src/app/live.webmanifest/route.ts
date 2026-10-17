/** A second web app manifest that opens straight to My Live. /widget links it, so Add to Home Screen there lands on /live. */
export const dynamic = "force-static";

export function GET() {
  return new Response(
    JSON.stringify({
      id: "/live",
      name: "Portal Juice Live",
      short_name: "PJ Live",
      description: "Your open picks and parlays, live.",
      start_url: "/live",
      scope: "/",
      display: "standalone",
      background_color: "#030306",
      theme_color: "#030306",
      icons: [
        { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
        { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
        { src: "/icons/icon-512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      ],
    }),
    { headers: { "content-type": "application/manifest+json", "cache-control": "public, max-age=3600" } }
  );
}
