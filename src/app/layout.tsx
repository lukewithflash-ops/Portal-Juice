import ScrollReset from "@/components/ScrollReset";
import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Orbitron } from "next/font/google";
import InstallCapture from "@/components/InstallCapture";
import { NATIVE_BOOT } from "@/lib/native";
import DeployWatch from "@/components/DeployWatch";
import SyncAgent from "@/components/SyncAgent";
import { PrefsProvider } from "@/components/Prefs";
import NotifyBanner from "@/components/NotifyBanner";
import SiteHeader from "@/components/SiteHeader";
import LiveBanner from "@/components/LiveBanner";
import LaunchWelcome from "@/components/LaunchWelcome";
import GiftNotePopup from "@/components/GiftNotePopup";
import ChromeVars from "@/components/ChromeVars";
import PortalWipe from "@/components/PortalWipe";
import { AutoGrade } from "@/components/AutoGrade";
import { UndoToast } from "@/components/PickEdit";
import SweatWatch from "@/components/SweatMode";
import { QuestAgent } from "@/components/Quests";
import { Suspense } from "react";
import { LiveHubProvider } from "@/components/LiveHub";
import SiteFooter from "@/components/SiteFooter";
import SectionTabs from "@/components/SectionTabs";
import BottomTabs from "@/components/BottomTabs";
import NativeOffline from "@/components/NativeOffline";
import ThemeApply from "@/components/ThemeApply";
import PageEnter from "@/components/PageEnter";
import { SITE_NAME, SITE_URL, TAGLINE } from "@/lib/site";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
const display = Orbitron({ variable: "--font-display", subsets: ["latin"], weight: ["700", "900"] });

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: SITE_NAME, template: `%s · ${SITE_NAME}` },
  description: `${TAGLINE} Lines, juice, streaks. Not a book.`,
  applicationName: SITE_NAME,
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: SITE_NAME,
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
  themeColor: "#06030e",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
  // App feel: no pinch or double-tap zoom, so nobody gets stuck zoomed in.
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: NATIVE_BOOT }} />
      </head>
      <body className={`${geistSans.variable} ${geistMono.variable} ${display.variable} portal-bg antialiased`}>
        <PrefsProvider>
          <LiveHubProvider>
            <InstallCapture />
            <DeployWatch />
            <SyncAgent />
            <div className="pj-app flex flex-col">
              {/* One sticky stack: nav, live banner, then page bars (league chips). Solid, no gaps. */}
              <div className="top-stack">
                <SiteHeader />
                <SectionTabs />
                <LiveBanner />
                <div id="top-stack-slot" />
              </div>
              {/* The stack is position: fixed (never moves with scroll, momentum or rubber-band); this spacer holds its measured height. */}
              <ScrollReset />
              {/* The page scrolls in here; the top stack above never scrolls. */}
              <div id="pj-scroll" className="pj-scroll flex flex-col">
              <ChromeVars />
              <PortalWipe />
              <LaunchWelcome />
              <GiftNotePopup />
              <AutoGrade />
              <UndoToast />
              <Suspense fallback={null}>
                <SweatWatch />
                <QuestAgent />
              </Suspense>
              <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-8 pt-4">
                <NotifyBanner />
                <PageEnter>{children}</PageEnter>
              </main>
              <SiteFooter />
              </div>
            </div>
            <BottomTabs />
            <NativeOffline />
            {process.env.PJ_COINS === "1" ? <ThemeApply /> : null}
          </LiveHubProvider>
        </PrefsProvider>
      </body>
    </html>
  );
}
