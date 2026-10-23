import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.portaljuice',
  appName: 'Portal Juice',
  webDir: 'ios-shell',
  // The site detects the app by this tag (and window.Capacitor) to hide web-only purchase/install UI.
  appendUserAgent: 'PortalJuiceApp',
  backgroundColor: '#07040f',
  server: {
    url: 'https://portaljuice.app',
    cleartext: false,
    // Bundled page shown when portaljuice.app can't load (no signal, airplane mode).
    errorPath: 'offline.html',
  },
  ios: {
    contentInset: 'automatic',
    backgroundColor: '#07040f',
  },
};

export default config;
