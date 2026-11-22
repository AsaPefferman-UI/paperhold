// Regenerates docs/screenshot-merge.png from a running preview (pnpm build && pnpm preview).
import { chromium } from '@playwright/test';

const base = process.env.BASE_URL ?? 'http://localhost:3103';
const corpus = 'packages/core/fixtures/corpus';
const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 1280, height: 720 },
  colorScheme: 'light',
});
await page.goto(`${base}/merge`);
await page
  .getByLabel('Choose PDFs or drop them here')
  .setInputFiles([`${corpus}/simple.pdf`, `${corpus}/acroform.pdf`, `${corpus}/pdf-2.0.pdf`]);
await page.waitForTimeout(400); // let colour transitions settle
await page.screenshot({ path: 'docs/screenshot-merge.png' });
await browser.close();
