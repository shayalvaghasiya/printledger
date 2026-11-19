import type { CapacitorConfig } from '@capacitor/cli';

// Capacitor wraps the built web app (dist/) into native iOS/Android shells.
// All state lives in IndexedDB inside the WebView, so the app stays offline.
const config: CapacitorConfig = {
  appId: 'com.printledger.app',
  appName: 'PrintLedger',
  webDir: 'dist',
  bundledWebRuntime: false,
  server: {
    androidScheme: 'https',
  },
};

export default config;