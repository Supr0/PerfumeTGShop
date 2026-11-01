import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Local dev: the API runs on :8000 (uvicorn), so same-origin `/v1/...`
  // requests made by the app are proxied there instead of hitting Vite.
  // In production nginx does the same thing (see apps/web/nginx.conf).
  server: {
    proxy: {
      '/v1': 'http://127.0.0.1:8000',
      '/healthz': 'http://127.0.0.1:8000',
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
  },
});
