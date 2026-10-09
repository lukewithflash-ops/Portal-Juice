import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import InstallCapture from "@/components/InstallCapture";
import { PrefsProvider } from "@/components/Prefs";
import NotifyBanner from "@/components/NotifyBanner";
import SiteHeader from "@/components/SiteHeader";
import LiveBanner from "@/components/LiveBanner";
import { LiveHubProvider } from "@/components/LiveHub";
import SiteFooter from "@/components/SiteFooter";
import { SITE_NAME, SITE_URL, TAGLINE } from "@/lib/site";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: SITE_NAME, template: `%s · ${SITE_NAME}` },
  description: `${TAGLINE} Lines, juice, streaks. Not a book.`,
  applicationName: SITE_NAME,
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Juice",
    statusBarStyle: "black-translucent",
  },
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: "#030306",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} portal-bg antialiased`}>
        <PrefsProvider>
          <LiveHubProvider>
            <InstallCapture />
            <div className="flex min-h-screen flex-col">
              <SiteHeader />
              <LiveBanner />
              <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-10 pt-[calc(6.6rem+env(safe-area-inset-top)+var(--live-h,0px))]">
                <NotifyBanner />
                {children}
              </main>
              <SiteFooter />
            </div>
          </LiveHubProvider>
        </PrefsProvider>
      </body>
    </html>
  );
}
