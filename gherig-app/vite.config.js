/**
 * GhERIG App · Vite config
 * ────────────────────────────────────────────────────────────────────
 * The dev server proxies API calls to NCRIS so the React app and the
 * NCRIS server can run on different ports without CORS headaches.
 *
 *   React dev server: http://localhost:3000
 *   NCRIS server:     http://localhost:4000
 *
 * Calls from the React app to /api/v1/* are forwarded to localhost:4000
 * by the dev server. WebSocket upgrades on /ws/v1/events are also forwarded.
 *
 * In production this proxy is replaced by your real ingress (NGINX,
 * Cloudflare, etc.). The frontend code is unchanged.
 */

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    host: '0.0.0.0',
    proxy: {
      '/api':       { target: 'http://localhost:4000', changeOrigin: true },
      '/fhir':      { target: 'http://localhost:4000', changeOrigin: true },
      '/healthz':   { target: 'http://localhost:4000', changeOrigin: true },
      '/metrics':   { target: 'http://localhost:4000', changeOrigin: true },
      '/ws':        { target: 'ws://localhost:4000',   ws: true, changeOrigin: true },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
