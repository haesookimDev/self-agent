import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.continuum.agent',
  appName: 'Continuum',
  webDir: 'dist',
  server: { androidScheme: 'https' },
};

export default config;
