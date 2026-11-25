// Build-time plugin: response headers (preview, Cloudflare Pages), per-route HTML with SEO
// metadata, sitemap, robots, web manifest, self-hosted pdf.js / OCR data, and the service
// worker. Keeps the static output self-describing so any static host can serve it.
import { createHash } from 'node:crypto';
import {
  cpSync,
  createReadStream,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, normalize, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Plugin } from 'vite';
import { securityHeaders } from '../security-headers.ts';
import type { SiteConfig } from '../site.config.ts';
import { PAGES, slugOf, TOOLS } from '../src/tools.ts';
import { OCR_BASE, ocrAssets, ocrManifest } from './ocr-assets.ts';

const here = dirname(fileURLToPath(import.meta.url));

export const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

interface RouteMeta {
  path: string;
  title: string;
  description: string;
}

/** Every crawlable route with its title and description. */
export function routes(site: SiteConfig): RouteMeta[] {
  return [
    ...PAGES.map((p) => ({
      path: p.path,
      title: p.path === '/' ? `${site.name}: ${p.name}` : `${p.name} | ${site.name}`,
      description: p.description,
    })),
    ...TOOLS.map((t) => ({
      path: t.path,
      title: `${t.name} | ${site.name}`,
      description: t.description,
    })),
  ];
}

/** The <head> block for one route: title, description, canonical, Open Graph, Twitter card. */
export function headFor(site: SiteConfig, r: RouteMeta): string {
  const url = `${site.url}${r.path === '/' ? '/' : r.path}`;
  const e = escapeHtml;
  return [
    `<title>${e(r.title)}</title>`,
    `<meta name="description" content="${e(r.description)}" />`,
    `<link rel="canonical" href="${e(url)}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="${e(site.name)}" />`,
    `<meta property="og:title" content="${e(r.title)}" />`,
    `<meta property="og:description" content="${e(r.description)}" />`,
    `<meta property="og:url" content="${e(url)}" />`,
    `<meta property="og:image" content="${e(`${site.url}/og/${slugOf(r.path)}.png`)}" />`,
    `<meta property="og:image:width" content="1200" />`,
    `<meta property="og:image:height" content="630" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
  ].join('\n    ');
}

const SEO_BLOCK = /<!--seo:start-->[\s\S]*?<!--seo:end-->/;
const wrap = (head: string) => `<!--seo:start-->\n    ${head}\n    <!--seo:end-->`;

function analyticsTag(site: SiteConfig): string {
  if (site.analytics.provider !== 'cloudflare') return '';
  // Token is validated as [A-Za-z0-9]{16,64} in resolveSite, so it is safe in an attribute.
  return `<script defer src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon='{"token":"${site.analytics.token}"}'></script>`;
}

export function headersFile(site: SiteConfig): string {
  const lines = Object.entries(securityHeaders(site.analytics)).map(([k, v]) => `  ${k}: ${v}`);
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
    '/manifest.webmanifest',
    '  Content-Type: application/manifest+json',
    '',
  ].join('\n');
}

export function sitemap(site: SiteConfig): string {
  const urls = routes(site).map(
    (r) => `  <url><loc>${escapeHtml(`${site.url}${r.path}`)}</loc></url>`,
  );
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`;
}

export function webManifest(site: SiteConfig): string {
  return JSON.stringify(
    {
      name: site.name,
      short_name: site.name,
      description: site.tagline,
      start_url: '/',
      scope: '/',
      display: 'standalone',
      background_color: '#efdca6',
      theme_color: '#e3c46e',
      icons: [
        { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
        { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
        {
          src: '/icons/icon-maskable-512.png',
          sizes: '512x512',
          type: 'image/png',
          purpose: 'maskable',
        },
        { src: '/favicon.svg', sizes: 'any', type: 'image/svg+xml' },
      ],
    },
    null,
    2,
  );
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

const walk = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((d) =>
    d.isDirectory() ? walk(join(dir, d.name)) : [join(dir, d.name)],
  );

/** Precache everything needed to run any tool offline; big binaries are cached on first use. */
export function precacheList(outDir: string): string[] {
  return walk(outDir)
    .map((f) => `/${relative(outDir, f).split(sep).join('/')}`)
    .filter(
      (p) =>
        !p.endsWith('.map') &&
        !p.endsWith('.wasm') &&
        !/^\/(ocr|pdfjs)-/.test(p) &&
        !/^\/og\//.test(p) &&
        !['/sw.js', '/_headers', '/robots.txt', '/sitemap.xml'].includes(p),
    )
    .sort();
}

export function serviceWorker(outDir: string): string {
  const files = precacheList(outDir);
  const hash = createHash('sha256');
  for (const f of files) hash.update(f).update(readFileSync(join(outDir, f)));
  return readFileSync(join(here, 'sw-template.js'), 'utf8')
    .replace('__VERSION__', hash.digest('hex').slice(0, 16))
    .replace('__PRECACHE__', JSON.stringify(files))
    .replace('__VERSIONED_DIRS__', JSON.stringify([PDFJS_BASE, OCR_BASE]));
}

export function sitePlugin(site: SiteConfig): Plugin {
  let outDir = 'dist';
  const home = routes(site)[0]!;
  return {
    name: 'pdf-tools-site',
    config() {
      // The analytics token stays out of the bundle; the page only needs to know if it is on.
      const publicSite = { ...site, analytics: { provider: site.analytics.provider } };
      return {
        define: {
          __PDFJS_BASE__: JSON.stringify(PDFJS_BASE),
          __OCR_MANIFEST__: JSON.stringify(ocrManifest()),
          __SITE__: JSON.stringify(publicSite),
        },
      };
    },
    configResolved(config) {
      outDir = config.build.outDir;
    },
    transformIndexHtml(html) {
      return html
        .replace('<!--seo-->', wrap(headFor(site, home)))
        .replace('</body>', `${analyticsTag(site)}</body>`);
    },
    configureServer(server) {
      // Dev server: every known route renders the app shell (the build writes one file per route).
      const known = new Set(routes(site).map((r) => r.path));
      server.middlewares.use((req, _res, next) => {
        const path = req.url?.split('?')[0]?.replace(/\/+$/, '') || '/';
        if (req.method === 'GET' && known.has(path) && path !== '/') req.url = '/index.html';
        next();
      });
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
      const headers = securityHeaders(site.analytics);
      server.middlewares.use((req, res, next) => {
        for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
        if (req.url === '/sw.js') res.setHeader('Cache-Control', 'no-cache');
        // Clean URLs, as on the static host: /merge serves merge/index.html.
        const [path = '/', query = ''] = (req.url ?? '/').split('?');
        const page = path === '/' ? 'index.html' : `${path.replace(/^\/+|\/+$/g, '')}/index.html`;
        if (req.method === 'GET' && !/\.[a-z0-9]+$/i.test(path) && existsSync(join(outDir, page))) {
          req.url = `/${page}${query ? `?${query}` : ''}`;
        }
        if (req.url === '/manifest.webmanifest')
          res.setHeader('Content-Type', 'application/manifest+json');
        next();
      });
      // After the static handler: unknown paths get 404.html with a 404, like the static host.
      return () => {
        server.middlewares.use((_req, res) => {
          res.statusCode = 404;
          res.setHeader('Content-Type', 'text/html; charset=utf-8');
          res.end(readFileSync(join(outDir, '404.html')));
        });
      };
    },
    closeBundle() {
      const index = readFileSync(join(outDir, 'index.html'), 'utf8');
      for (const r of routes(site)) {
        if (r.path === '/') continue;
        const dir = join(outDir, r.path.slice(1));
        mkdirSync(dir, { recursive: true });
        writeFileSync(join(dir, 'index.html'), index.replace(SEO_BLOCK, wrap(headFor(site, r))));
      }
      writeFileSync(
        join(outDir, '404.html'),
        index
          .replace(
            SEO_BLOCK,
            wrap(
              headFor(site, {
                path: '/404',
                title: `Page not found | ${site.name}`,
                description: 'There is no page at this address.',
              }),
            ),
          )
          .replace(
            /<link rel="canonical"[^>]*>\n\s*/,
            '<meta name="robots" content="noindex" />\n    ',
          ),
      );
      writeFileSync(join(outDir, '_headers'), headersFile(site));
      writeFileSync(join(outDir, 'sitemap.xml'), sitemap(site));
      writeFileSync(
        join(outDir, 'robots.txt'),
        `User-agent: *\nAllow: /\n\nSitemap: ${site.url}/sitemap.xml\n`,
      );
      writeFileSync(join(outDir, 'manifest.webmanifest'), webManifest(site));
      mkdirSync(join(outDir, OCR_BASE), { recursive: true });
      for (const a of ocrAssets()) cpSync(a.source, join(outDir, OCR_BASE, a.name));
      writeFileSync(
        join(outDir, OCR_BASE, 'manifest.json'),
        `${JSON.stringify(ocrManifest(), null, 2)}\n`,
      );
      for (const dir of PDFJS_DIRS) {
        cpSync(join(pdfjsDir, dir), join(outDir, PDFJS_BASE, dir), {
          recursive: true,
          filter: (src) => shipPdfjsFile(src),
        });
      }
      // Last: the service worker hashes the final output.
      writeFileSync(join(outDir, 'sw.js'), serviceWorker(outDir));
    },
  };
}
