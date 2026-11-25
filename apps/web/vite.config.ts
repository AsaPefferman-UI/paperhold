import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';
import { sitePlugin } from './build/site-plugin.ts';
import { resolveSite } from './site.config.ts';

export default defineConfig(({ mode }) => {
  // SITE_* variables (from the environment or .env files) override site.config.ts.
  const site = resolveSite(loadEnv(mode, process.cwd(), 'SITE_'));
  return {
    // Multi-page output: each route has its own HTML (as on the static host); no SPA fallback.
    appType: 'mpa',
    plugins: [react(), sitePlugin(site)],
    worker: { format: 'es' },
    build: { target: 'es2022', sourcemap: true },
    server: { port: 3103, strictPort: true },
    preview: { port: 3103, strictPort: true },
  };
});
