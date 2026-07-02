import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Dev proxy makes the client same-origin with the API, so the httpOnly auth
// cookie and the Socket.IO handshake work without any CORS gymnastics.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Allow serving `../shared/*` runtime imports (e.g. the pure tournament
    // logic) in dev — and ONLY that dir, not the whole monorepo root, so the
    // dev server can never be asked for server files. Type-only imports are
    // erased at build time, but value imports are fetched.
    fs: { allow: ['.', '../shared'] },
    proxy: {
      '/api': { target: 'http://localhost:3001', changeOrigin: true },
      '/socket.io': { target: 'http://localhost:3001', ws: true, changeOrigin: true },
    },
  },
});
