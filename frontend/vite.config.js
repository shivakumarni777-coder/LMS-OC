import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// The dev backend the proxy forwards to when nothing overrides it.
const DEFAULT_BACKEND_ORIGIN = 'http://localhost:8080';

export default defineConfig(({ mode }) => {
  // loadEnv, not process.env. Vite loads .env files for import.meta.env inside
  // the app bundle, but never copies them into process.env for the config file
  // itself. Reading process.env.VITE_BACKEND_ORIGIN here therefore always
  // evaluated to undefined and silently fell back to :8080, so a correctly
  // written .env.local was ignored and every /api call hit a port with nothing
  // listening on it.
  //
  // Mode is passed in rather than assumed, so `npm run demo` (--mode demo)
  // still picks up the unreachable-in-demo-mode placeholder from .env.demo.
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  const BACKEND_ORIGIN = env.VITE_BACKEND_ORIGIN ?? DEFAULT_BACKEND_ORIGIN;

  return {
  plugins: [react(), tailwindcss()],

  server: {
    port: 5173,
    proxy: {
      // Proxying keeps the browser on a single origin, so the session and
      // CSRF cookies are attached automatically and CORS never applies.
      // changeOrigin stays false so the backend sees the dev-server host,
      // which keeps the cookies scoped as expected.
      '/api': {
        target: BACKEND_ORIGIN,
        changeOrigin: false,
      },
    },
  },

  build: {
    outDir: 'dist',
    sourcemap: true,
    rollupOptions: {
      output: {
        // Split the heavy, rarely-changing dependencies out of the app chunk so
        // a change to app code does not invalidate them in the browser cache.
        // Function form: rolldown (Vite 8) rejects the object form.
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (/[\\/]node_modules[\\/](react|react-dom|react-router|react-router-dom)[\\/]/.test(id)) {
            return 'react';
          }
          if (id.includes('@tanstack')) return 'query';
          if (id.includes('axios')) return 'http';
          return undefined;
        },
      },
    },
  },

  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.js'],
    css: false,
  },
  };
});
