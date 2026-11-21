// vite.config.js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    // esbuild minification: 1,497 KB -> 420 KB raw, 248 KB -> 127 KB gzipped.
    minify: 'esbuild',
    // Flip to true (or 'hidden') when you need to debug a production error;
    // the map is ~2 MB and is not fetched by normal visitors either way.
    sourcemap: false
  },
  server: {
    port: 5173,
    strictPort: false,
    cors: true,
    proxy: {
      '/api': {
        target: process.env.VITE_API_TARGET || 'http://localhost:5000',
        changeOrigin: true,
        secure: false
      }
    }
  }
});
