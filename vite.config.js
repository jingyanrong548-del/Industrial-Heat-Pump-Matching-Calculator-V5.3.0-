import { defineConfig } from 'vite';

export default defineConfig({
  base: '/Industrial-Heat-Pump-Matching-Calculator-V5.3.0-/',
  server: {
    port: 3000,
    open: true
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: false
  }
});

