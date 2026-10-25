import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.portaljuice',
  appName: 'Portal Juice',
  webDir: 'ios-shell',
  // The site detects the app by this tag (and window.Capacitor) to hide web-only purchase/install UI.
  appendUserAgent: 'PortalJuiceApp',
  backgroundColor: '#06030e',
  server: {
    url: 'https://portaljuice.app',
    cleartext: false,
    // Bundled page shown when portaljuice.app can't load (no signal, airplane mode).
    errorPath: 'offline.html',
  },
  ios: {
    contentInset: 'never',
    // Native shell also turns off scroll bounce (ios/App/App/AppDelegate.swift, PJBridgeViewController).
    scrollEnabled: true,
    backgroundColor: '#06030e',
  },
};

export default config;
