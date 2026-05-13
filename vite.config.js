import { defineConfig } from 'vite';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Vite's root is ./public, so the built-in publicDir doesn't catch loose
// static files there. Copy llms.txt + docs/agents/* into dist/ at the end
// of every build so the agent-facing surface ships to Vercel.
function copyAgentStatic() {
  const entries = [
    { from: 'public/llms.txt', to: 'dist/llms.txt' },
    { from: 'public/docs', to: 'dist/docs' },
  ];
  return {
    name: 'copy-agent-static',
    apply: 'build',
    closeBundle() {
      const repoRoot = path.resolve(__dirname);
      for (const { from, to } of entries) {
        const src = path.join(repoRoot, from);
        const dst = path.join(repoRoot, to);
        if (!fs.existsSync(src)) continue;
        fs.cpSync(src, dst, { recursive: true });
      }
    },
  };
}

export default defineConfig({
  root: './public',
  plugins: [copyAgentStatic()],
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

