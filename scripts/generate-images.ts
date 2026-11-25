// Regenerates committed raster assets: app icons, Open Graph images, and the landing-page
// screenshot. Run after renaming the site (docs/LAUNCH.md):
//   pnpm build && pnpm preview   (in another terminal)
//   pnpm images
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { resolveSite } from '../apps/web/site.config.ts';
import { PAGES, slugOf, TOOLS } from '../apps/web/src/tools.ts';

const site = resolveSite(process.env);
const pub = 'apps/web/public';
const base = process.env.BASE_URL ?? 'http://localhost:3103';
const corpus = 'packages/core/fixtures/corpus';
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const svg = readFileSync(join(pub, 'favicon.svg'), 'utf8');

mkdirSync(join(pub, 'icons'), { recursive: true });
mkdirSync(join(pub, 'og'), { recursive: true });
mkdirSync(join(pub, 'landing'), { recursive: true });

const browser = await chromium.launch();
try {
  const page = await browser.newPage();

  for (const [name, size, maskable] of [
    ['icon-192.png', 192, false],
    ['icon-512.png', 512, false],
    ['icon-maskable-512.png', 512, true],
    ['apple-touch-icon.png', 180, true],
  ] as const) {
    await page.setViewportSize({ width: size, height: size });
    const inner = maskable ? Math.round(size * 0.62) : size;
    await page.setContent(
      `<body style="margin:0;display:grid;place-items:center;width:${size}px;height:${size}px;background:${maskable ? '#efdca6' : 'transparent'}">
         <div style="width:${inner}px;height:${inner}px">${svg.replace('<svg', '<svg width="100%" height="100%"')}</div></body>`,
    );
    await page.screenshot({ path: join(pub, 'icons', name), omitBackground: !maskable });
  }

  await page.setViewportSize({ width: 1200, height: 630 });
  const all = [
    ...PAGES.map((p) => ({ path: p.path, title: p.path === '/' ? site.tagline : p.name })),
    ...TOOLS.map((t) => ({ path: t.path, title: t.name })),
  ];
  for (const r of all) {
    await page.setContent(`<body style="margin:0;width:1200px;height:630px;background:#efdca6;font-family:'Segoe UI',system-ui,sans-serif;color:#1b2130">
      <div style="height:110px;background:#e3c46e;border-bottom:2px solid #b8953f;display:flex;align-items:flex-end;padding:0 72px;gap:28px">
        <div style="font-weight:800;font-size:40px;padding-bottom:22px">${esc(site.name)}</div>
        <div style="background:#efdca6;border:2px solid #b8953f;border-bottom:0;border-radius:10px 10px 0 0;padding:14px 28px;font-size:26px;font-weight:600;margin-bottom:-2px">${esc(r.path === '/' ? 'Home' : (TOOLS.find((t) => t.path === r.path)?.tab ?? 'Privacy'))}</div>
      </div>
      <div style="margin:56px 72px 0;background:#fff;border:2px solid #d9cba3;border-radius:12px;padding:52px 56px;box-shadow:0 10px 30px -12px rgba(60,45,10,.35)">
        <div style="font-size:64px;font-weight:800;letter-spacing:-1.5px;line-height:1.05">${esc(r.title)}</div>
        <div style="margin-top:28px;font-size:30px;color:#22693a;font-weight:600">Runs in your browser. Your files are never uploaded.</div>
      </div></body>`);
    await page.screenshot({ path: join(pub, 'og', `${slugOf(r.path)}.png`) });
  }

  // The real product, for the landing page hero (light scheme, three files ready to merge).
  const shot = await browser.newPage({
    viewport: { width: 1280, height: 720 },
    colorScheme: 'light',
  });
  await shot.goto(`${base}/merge`);
  await shot
    .getByLabel('Choose PDFs or drop them here')
    .setInputFiles([`${corpus}/simple.pdf`, `${corpus}/acroform.pdf`, `${corpus}/pdf-2.0.pdf`]);
  await shot.waitForTimeout(400); // let colour transitions settle
  await shot.screenshot({ path: join(pub, 'landing', 'merge-tool.png') });
  await shot.screenshot({ path: 'docs/screenshot-merge.png' });
} finally {
  await browser.close();
}
console.info('Images written to apps/web/public/{icons,og,landing}');
