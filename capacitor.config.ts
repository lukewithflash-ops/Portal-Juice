import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.portaljuice',
  appName: 'Portal Juice',
  webDir: 'ios-shell',
  server: {
    url: 'https://portaljuice.app',
    cleartext: false,
  },
  ios: {
    contentInset: 'automatic',
  },
};

export default config;
