import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const BACKEND_ORIGIN = process.env.VITE_BACKEND_ORIGIN ?? 'http://localhost:8080';

export default defineConfig({
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
});
