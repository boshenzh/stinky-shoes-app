import { defineConfig } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig({
  root: './public',
  server: {
    port: 5173,
    proxy: {
      // Proxy API requests to Express server
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      // Proxy config endpoint
      '/config': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'public/index.html'),
      },
    },
    // Optimize for production
    // Using 'esbuild' (default) is faster and doesn't require terser
    minify: 'esbuild', // Faster than terser, built into Vite
    // Alternative: 'terser' for more aggressive minification (requires terser package)
  },
  // Enable source maps for better debugging
  esbuild: {
    sourcemap: true,
  },
});

