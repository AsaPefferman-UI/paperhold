import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { readFileSync } from 'node:fs';
import { expect, fixture, test } from './fixtures.ts';

const DONE = 'Done on this device. Nothing was uploaded.';

async function textOf(bytes: Buffer): Promise<string> {
  const task = getDocument({ data: new Uint8Array(bytes), verbosity: 0 });
  const doc = await task.promise;
  let text = '';
  for (let i = 1; i <= doc.numPages; i++) {
    const c = await (await doc.getPage(i)).getTextContent();
    text += c.items.map((it) => ('str' in it ? it.str : '')).join(' ') + '\n';
  }
  await task.destroy();
  return text;
}

test('OCR makes a scanned PDF searchable, with integrity-checked downloads from our origin', async ({
  page,
}) => {
  const ocrRequests: string[] = [];
  page.on('request', (r) => {
    if (r.url().includes('/ocr-')) ocrRequests.push(new URL(r.url()).pathname);
  });
  await page.goto('/ocr');
  await page.getByLabel('Choose a PDF or drop it here').setInputFiles(fixture('scanned.pdf'));
  await expect(page.getByText(/downloads the OCR engine/)).toContainText('MB');
  await page.getByRole('button', { name: 'Make searchable' }).click();
  await expect(page.getByText(DONE)).toBeVisible({ timeout: 60_000 });
  const pending = page.waitForEvent('download');
  await page.getByRole('link', { name: /Download scanned-searchable\.pdf/ }).click();
  const out = readFileSync(await (await pending).path());
  const text = await textOf(out);
  expect(text).toMatch(/quick\s+brown\s+fox/);
  expect(text).toContain('4417');
  expect(ocrRequests.some((p) => p.endsWith('.wasm'))).toBe(true);
  expect(ocrRequests.some((p) => p.includes('eng-'))).toBe(true);
  expect(ocrRequests.some((p) => p.includes('deu-'))).toBe(false); // only chosen languages load
});

test('OCR refuses language data that fails its SHA-256 check', async ({ page }) => {
  await page.route('**/ocr-*/eng-*', async (route) => {
    const res = await route.fetch();
    const body = Buffer.from(await res.body());
    body.writeUInt8(body.readUInt8(body.length - 1) ^ 0xff, body.length - 1); // one flipped byte
    await route.fulfill({ response: res, body });
  });
  await page.goto('/ocr');
  await page.getByLabel('Choose a PDF or drop it here').setInputFiles(fixture('scanned.pdf'));
  await page.getByRole('button', { name: 'Make searchable' }).click();
  await expect(page.getByRole('alert')).toContainText('failed its integrity check', {
    timeout: 30_000,
  });
});

test('OCR can be cancelled', async ({ page }) => {
  await page.goto('/ocr');
  await page
    .getByLabel('Choose a PDF or drop it here')
    .setInputFiles(fixture('large-page-count.pdf'));
  await page.getByRole('button', { name: 'Make searchable' }).click();
  await expect(page.getByText(/Read \d+ of 1000 pages/)).toBeVisible({ timeout: 60_000 });
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByRole('button', { name: 'Make searchable' })).toBeEnabled();
  await expect(page.getByText(DONE)).toHaveCount(0);
});
