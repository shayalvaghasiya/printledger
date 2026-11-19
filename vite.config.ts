import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// PrintLedger is a fully local app. `base: './'` makes the build work when the
// bundle is loaded from `file://` inside the Electron shell (no server needed).
export default defineConfig({
  base: './',
  plugins: [react()],
  server: {
    host: true, // expose on LAN so a phone on the same network can open the app
    port: 5173,
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    coverage: {
      reporter: ['text', 'html'],
    },
  },
});