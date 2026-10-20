import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.portaljuice',
  appName: 'Portal Juice',
  webDir: 'public',
  server: {
    url: 'https://portal-juice.vercel.app',
    cleartext: false,
  },
  ios: {
    contentInset: 'automatic',
  },
};

export default config;
