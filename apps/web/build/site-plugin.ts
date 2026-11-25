// Build-time plugin: response headers for preview and Cloudflare Pages, per-route HTML for SEO,
// and a sitemap. Keeps the static output self-describing so any static host can serve it.
import {
  cpSync,
  createReadStream,
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, normalize, sep } from 'node:path';
import type { Plugin } from 'vite';
import { securityHeaders } from '../security-headers.ts';
import { OCR_BASE, ocrAssets, ocrManifest } from './ocr-assets.ts';
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
    '/ocr-*',
    '  Cache-Control: public, max-age=31536000, immutable',
    '/pdfjs-*',
    '  Cache-Control: public, max-age=31536000, immutable',
    '/sw.js',
    '  Cache-Control: no-cache',
    '',
  ].join('\n');
}

// pdf.js data files (fonts, CMaps, image decoders) are self-hosted under a versioned path so
// they can be cached immutably. The scripting engine (quickjs) is deliberately not shipped.
const pdfjsDir = dirname(createRequire(import.meta.url).resolve('pdfjs-dist/package.json'));
const pdfjsVersion = (
  JSON.parse(readFileSync(join(pdfjsDir, 'package.json'), 'utf8')) as { version: string }
).version;
export const PDFJS_BASE = `/pdfjs-${pdfjsVersion}/`;
const PDFJS_DIRS = ['cmaps', 'standard_fonts', 'wasm', 'iccs'];
const shipPdfjsFile = (rel: string) => !/quickjs/i.test(rel);

export function sitePlugin({ analyticsOrigin = '', siteUrl = '' } = {}): Plugin {
  let outDir = 'dist';
  return {
    name: 'pdf-tools-site',
    config() {
      return {
        define: {
          __PDFJS_BASE__: JSON.stringify(PDFJS_BASE),
          __OCR_MANIFEST__: JSON.stringify(ocrManifest()),
        },
      };
    },
    configResolved(config) {
      outDir = config.build.outDir;
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!req.url?.startsWith(OCR_BASE)) return next();
        const found = ocrAssets().find((a) => req.url === `${OCR_BASE}${a.name}`);
        if (!found) {
          res.statusCode = 404;
          return res.end();
        }
        res.setHeader(
          'Content-Type',
          found.name.endsWith('.wasm') ? 'application/wasm' : 'application/octet-stream',
        );
        createReadStream(found.source).pipe(res);
      });
      server.middlewares.use((req, res, next) => {
        if (!req.url?.startsWith(PDFJS_BASE)) return next();
        const rel = normalize(decodeURIComponent(req.url.slice(PDFJS_BASE.length).split('?')[0]!));
        const file = join(pdfjsDir, rel);
        if (
          rel.startsWith('..') ||
          !PDFJS_DIRS.includes(rel.split(sep)[0]!) ||
          !shipPdfjsFile(rel) ||
          !existsSync(file) ||
          !statSync(file).isFile()
        ) {
          res.statusCode = 404;
          return res.end();
        }
        if (file.endsWith('.wasm')) res.setHeader('Content-Type', 'application/wasm');
        createReadStream(file).pipe(res);
      });
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
      mkdirSync(join(outDir, OCR_BASE), { recursive: true });
      for (const a of ocrAssets()) cpSync(a.source, join(outDir, OCR_BASE, a.name));
      writeFileSync(
        join(outDir, OCR_BASE, 'manifest.json'),
        `${JSON.stringify(ocrManifest(), null, 2)}
`,
      );
      for (const dir of PDFJS_DIRS) {
        cpSync(join(pdfjsDir, dir), join(outDir, PDFJS_BASE, dir), {
          recursive: true,
          filter: (src) => shipPdfjsFile(src),
        });
      }
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
