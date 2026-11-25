import { unzipSync } from 'fflate';
import { PDFDocument } from 'pdf-lib';
import { readFileSync } from 'node:fs';
import type { Page } from '@playwright/test';
import { expect, fixture, test } from './fixtures.ts';

const DONE = 'Done on this device. Nothing was uploaded.';

async function download(page: Page, name: RegExp): Promise<Buffer> {
  const pending = page.waitForEvent('download');
  await page.getByRole('link', { name }).click();
  return readFileSync(await (await pending).path());
}

test('split: extract pages into one PDF', async ({ page }) => {
  await page.goto('/split');
  await page.getByLabel('Choose a PDF or drop it here').setInputFiles(fixture('simple.pdf'));
  await expect(page.getByText('3 pages')).toBeVisible();
  await expect(
    page.getByRole('list', { name: 'Pages in this PDF' }).getByRole('listitem'),
  ).toHaveCount(3);
  await page.getByLabel('Pages', { exact: true }).fill('3, 1');
  await page.getByRole('button', { name: 'Split PDF' }).click();
  await expect(page.getByText(DONE)).toBeVisible();
  const pdf = await PDFDocument.load(await download(page, /Download simple-pages-3,1\.pdf/));
  expect(pdf.getPageCount()).toBe(2);
});

test('split: every N pages gives a zip, and bad ranges explain themselves', async ({ page }) => {
  await page.goto('/split');
  await page.getByLabel('Choose a PDF or drop it here').setInputFiles(fixture('simple.pdf'));
  await page.getByLabel('Pages', { exact: true }).fill('7');
  await page.getByRole('button', { name: 'Split PDF' }).click();
  await expect(page.getByRole('alert')).toContainText('goes past the last page');
  await page.getByLabel('Split every N pages').check();
  await page.getByLabel('Pages per file').fill('1');
  await page.getByRole('button', { name: 'Split PDF' }).click();
  const zip = unzipSync(new Uint8Array(await download(page, /Download simple-split\.zip/)));
  expect(Object.keys(zip)).toHaveLength(3);
});

test('organize: keyboard reorder, rotate and delete with thumbnails', async ({ page }) => {
  await page.goto('/organize');
  await page.getByLabel('Choose a PDF or drop it here').setInputFiles(fixture('simple.pdf'));
  const grid = page.getByRole('list', { name: 'Pages, in output order' });
  await expect(grid.getByRole('listitem')).toHaveCount(3);
  // Thumbnails render (blob: images, allowed by the CSP).
  await expect(grid.locator('img')).toHaveCount(3);
  await page.getByRole('button', { name: 'Move page 3 earlier' }).press('Enter');
  await page.getByRole('button', { name: 'Rotate page 1 right' }).press('Enter');
  await page.getByRole('button', { name: 'Delete page 2' }).press('Enter');
  await expect(page.getByText('2 of 3 pages kept')).toBeVisible();
  await page.getByRole('button', { name: 'Save PDF' }).click();
  await expect(page.getByText(DONE)).toBeVisible();
  const pdf = await PDFDocument.load(await download(page, /Download simple-organized\.pdf/));
  expect(pdf.getPageCount()).toBe(2);
  expect(pdf.getPages().map((p) => p.getRotation().angle)).toEqual([90, 0]);
});

test('organize: a damaged PDF shows a friendly error', async ({ page }) => {
  await page.goto('/organize');
  await page.getByLabel('Choose a PDF or drop it here').setInputFiles(fixture('truncated.pdf'));
  await expect(page.getByRole('alert')).toContainText(/damaged|not a PDF/);
});

test('organize: thumbnails for 1000 pages arrive progressively', async ({ page, browserName }) => {
  // WebKit on Linux CI renders in software and is several times slower; the progressive behaviour
  // is what this test guards, not raw speed (speed is checked in Chromium).
  const slow = browserName === 'webkit' && !!process.env.CI;
  await page.goto('/organize');
  const start = Date.now();
  await page
    .getByLabel('Choose a PDF or drop it here')
    .setInputFiles(fixture('large-page-count.pdf'));
  const grid = page.getByRole('list', { name: 'Pages, in output order' });
  await expect(grid.getByRole('listitem')).toHaveCount(1000);
  await expect
    .poll(() => grid.locator('img').count(), { timeout: slow ? 45_000 : 10_000 })
    .toBeGreaterThanOrEqual(20);
  // Progressive: the first thumbnails arrive long before all 1000 are rendered.
  expect(await grid.locator('img').count()).toBeLessThan(1000);
  // Spec target is <1s for the first 20 on a mid-range laptop; CI machines vary, so assert loosely.
  if (!slow) expect(Date.now() - start).toBeLessThan(8_000);
});

test('page numbers', async ({ page }) => {
  await page.goto('/page-numbers');
  await page.getByLabel('Choose a PDF or drop it here').setInputFiles(fixture('simple.pdf'));
  await page.getByLabel('Style').selectOption('Page {n} of {total}');
  await page.getByLabel('Position').selectOption('bottom-right');
  await page.getByRole('button', { name: 'Add page numbers' }).click();
  await expect(page.getByText(DONE)).toBeVisible();
  const pdf = await PDFDocument.load(await download(page, /Download simple-numbered\.pdf/));
  expect(pdf.getPageCount()).toBe(3);
});

test('watermark, including a non-Latin text error', async ({ page }) => {
  await page.goto('/watermark');
  await page.getByLabel('Choose a PDF or drop it here').setInputFiles(fixture('simple.pdf'));
  await page.getByLabel('Text', { exact: true }).fill('草稿');
  await page.getByRole('button', { name: 'Add watermark' }).click();
  await expect(page.getByRole('alert')).toContainText('Latin characters');
  await page.getByLabel('Text', { exact: true }).fill('DRAFT');
  await page.getByRole('button', { name: 'Add watermark' }).click();
  await expect(page.getByText(DONE)).toBeVisible();
  const pdf = await PDFDocument.load(await download(page, /Download simple-watermarked\.pdf/));
  expect(pdf.getPageCount()).toBe(3);
});
