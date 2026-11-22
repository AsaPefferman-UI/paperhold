import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';
import { sitePlugin } from './build/site-plugin.ts';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  return {
    plugins: [
      react(),
      sitePlugin({
        analyticsOrigin: env.VITE_ANALYTICS_ORIGIN ?? '',
        siteUrl: env.VITE_SITE_URL ?? '',
      }),
    ],
    worker: { format: 'es' },
    build: { target: 'es2022', sourcemap: true },
    server: { port: 3103, strictPort: true },
    preview: { port: 3103, strictPort: true },
  };
});
