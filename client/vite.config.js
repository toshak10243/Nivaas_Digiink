import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

// npm run dev        → real app; API calls go to the server (proxied below)
// npm run dev:demo   → same UI on in-memory sample data, no server needed
// npm run build      → client/dist, served by the Node server in production
// npm run build:demo → one self-contained HTML file (dist-demo/index.html) for sales demos
export default defineConfig(({ mode }) => ({
  plugins: [react(), ...(mode === 'demo' ? [viteSingleFile()] : [])],
  define: { __DEMO__: JSON.stringify(mode === 'demo') },
  build: { outDir: mode === 'demo' ? 'dist-demo' : 'dist', assetsInlineLimit: mode === 'demo' ? 100_000_000 : 4096 },
  server: {
    port: 5180,
    fs: { allow: ['..'] },
    proxy: Object.fromEntries(['/api', '/auth', '/p', '/uploads'].map(p => [p, 'http://localhost:4100'])),
  },
}));
