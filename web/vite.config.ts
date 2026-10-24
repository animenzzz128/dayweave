import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import type { Plugin } from 'vite';

// The demo build is fully static (GitHub Pages serves it under /dayweave/), so asset paths stay relative.
// `--mode server` talks to a Dayweave server on the development port instead of the in-browser demo.
const LOCAL_SERVER = 'http://127.0.0.1:8768';
// Cookie-free page counts for the public demo (src/lib/analytics.ts). Empty turns counting off; the variable lets tests
// point it elsewhere.
const GOATCOUNTER_URL = 'https://dayweave.goatcounter.com/count';

// `import x from '…/src/name.cjs?shared'` gives the shared rule file wrapped as `function (module, exports, require)`, so the
// browser runs the same source as the server without evaluating strings (src/lib/shared.ts).
const shared = (): Plugin => ({
  name: 'dayweave-shared',
  enforce: 'pre',
  transform(source, id) {
    if (!id.endsWith('.cjs?shared')) return null;
    return { code: `export default function (module, exports, require) {\n${source}\n}`, map: null };
  },
});

export default defineConfig(({ mode }) => ({
  base: './',
  plugins: [shared(), react(), tailwindcss()],
  define: {
    __DAYWEAVE_MODE__: JSON.stringify(mode === 'server' ? 'local' : 'demo'),
    __GOATCOUNTER_URL__: JSON.stringify(mode === 'production' ? loadEnv(mode, '.', 'DAYWEAVE_').DAYWEAVE_GOATCOUNTER_URL ?? GOATCOUNTER_URL : ''),
  },
  server: {
    port: 5173,
    strictPort: true,
    fs: { allow: ['..'] },
    proxy: mode === 'server' ? {
      '/api': {
        target: LOCAL_SERVER,
        changeOrigin: true,
        // The Dayweave server only accepts writes whose Origin is its own loopback address.
        headers: { origin: LOCAL_SERVER },
      },
    } : undefined,
  },
  build: { outDir: 'dist', emptyOutDir: true, sourcemap: false },
}));
