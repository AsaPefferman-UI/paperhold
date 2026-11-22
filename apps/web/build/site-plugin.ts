// Build-time plugin: response headers for preview and Cloudflare Pages, per-route HTML for SEO,
// and a sitemap. Keeps the static output self-describing so any static host can serve it.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Plugin } from 'vite';
import { securityHeaders } from '../security-headers.ts';
import { SITE_NAME, TOOLS } from '../src/tools.ts';

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function withMeta(html: string, title: string, description: string): string {
  return html
    .replace(/<title>[^<]*<\/title>/, `<title>${escapeHtml(title)}</title>`)
    .replace(
      /<meta\s+name="description"\s+content="[^"]*"\s*\/?>/,
      `<meta name="description" content="${escapeHtml(description)}" />`,
    );
}

export function headersFile(analyticsOrigin: string): string {
  const lines = Object.entries(securityHeaders(analyticsOrigin)).map(([k, v]) => `  ${k}: ${v}`);
  return [
    '/*',
    ...lines,
    '/assets/*',
    '  Cache-Control: public, max-age=31536000, immutable',
    '/sw.js',
    '  Cache-Control: no-cache',
    '',
  ].join('\n');
}

export function sitePlugin({ analyticsOrigin = '', siteUrl = '' } = {}): Plugin {
  let outDir = 'dist';
  return {
    name: 'pdf-tools-site',
    configResolved(config) {
      outDir = config.build.outDir;
    },
    configurePreviewServer(server) {
      const headers = securityHeaders(analyticsOrigin);
      server.middlewares.use((_req, res, next) => {
        for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
        next();
      });
    },
    closeBundle() {
      const index = readFileSync(join(outDir, 'index.html'), 'utf8');
      for (const tool of TOOLS) {
        const dir = join(outDir, tool.path.slice(1));
        mkdirSync(dir, { recursive: true });
        writeFileSync(
          join(dir, 'index.html'),
          withMeta(index, `${tool.name} | ${SITE_NAME}`, tool.description),
        );
      }
      writeFileSync(
        join(outDir, '404.html'),
        withMeta(index, `Page not found | ${SITE_NAME}`, 'There is no tool at this address.'),
      );
      writeFileSync(join(outDir, '_headers'), headersFile(analyticsOrigin));
      if (siteUrl) {
        const urls = ['/', ...TOOLS.map((t) => t.path)].map(
          (p) => `  <url><loc>${siteUrl}${p}</loc></url>`,
        );
        writeFileSync(
          join(outDir, 'sitemap.xml'),
          `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`,
        );
      }
    },
  };
}
