import { unzipSync } from 'fflate';
import { PDFDocument } from 'pdf-lib';
import { readFileSync, statSync } from 'node:fs';
import type { Page } from '@playwright/test';
import { expect, fixture, test } from './fixtures.ts';

const DONE = 'Done on this device. Nothing was uploaded.';

async function download(page: Page, name: RegExp): Promise<Buffer> {
  const pending = page.waitForEvent('download');
  await page.getByRole('link', { name }).click();
  return readFileSync(await (await pending).path());
}

test('images to PDF: JPG, PNG and browser-decoded BMP and GIF, EXIF-rotated photo upright', async ({
  page,
}) => {
  await page.goto('/images-to-pdf');
  await page
    .getByLabel('Choose images or drop them here')
    .setInputFiles([
      fixture('photo.jpg'),
      fixture('graphic.png'),
      fixture('gradient.bmp'),
      fixture('pixel.gif'),
      fixture('photo-exif-rotated.jpg'),
    ]);
  await expect(
    page.getByRole('list', { name: 'Images, in page order' }).getByRole('listitem'),
  ).toHaveCount(5);
  await page.getByLabel('Page size').selectOption('a4');
  await page.getByRole('button', { name: 'Convert 5 images to PDF' }).click();
  await expect(page.getByText(DONE)).toBeVisible();
  const pdf = await PDFDocument.load(await download(page, /Download images\.pdf/));
  expect(pdf.getPageCount()).toBe(5);
  const first = pdf.getPage(0);
  const last = pdf.getPage(4);
  expect(first.getWidth()).toBeGreaterThan(first.getHeight()); // landscape photo
  expect(last.getWidth()).toBeLessThan(last.getHeight()); // EXIF orientation 6 -> portrait
});

test('images to PDF: a fake image gets a friendly error', async ({ page }) => {
  await page.goto('/images-to-pdf');
  await page.getByLabel('Choose images or drop them here').setInputFiles({
    name: 'holiday.heic',
    mimeType: 'image/heic',
    buffer: Buffer.from('not really an image'),
  });
  await page.getByRole('button', { name: 'Convert 1 image to PDF' }).click();
  await expect(page.getByRole('alert')).toContainText('holiday.heic');
});

test('PDF to images: pages as a zip of PNGs', async ({ page }) => {
  await page.goto('/pdf-to-images');
  await page.getByLabel('Choose a PDF or drop it here').setInputFiles(fixture('simple.pdf'));
  await page.getByLabel('Resolution').selectOption('72');
  await page.getByRole('button', { name: 'Convert to images' }).click();
  await expect(page.getByText(DONE)).toBeVisible();
  const zip = unzipSync(new Uint8Array(await download(page, /Download simple-images\.zip/)));
  expect(Object.keys(zip)).toEqual(['simple-page-1.png', 'simple-page-2.png', 'simple-page-3.png']);
  expect([...zip['simple-page-1.png']!.subarray(1, 4)]).toEqual([0x50, 0x4e, 0x47]);
});

test('PDF to images: one page as JPG', async ({ page }) => {
  await page.goto('/pdf-to-images');
  await page.getByLabel('Choose a PDF or drop it here').setInputFiles(fixture('simple.pdf'));
  await page.getByLabel('Format').selectOption('jpeg');
  await page.getByLabel('Only these pages (optional)').fill('2');
  await page.getByRole('button', { name: 'Convert to images' }).click();
  const jpg = await download(page, /Download simple-page-2\.jpg/);
  expect([...jpg.subarray(0, 3)]).toEqual([0xff, 0xd8, 0xff]);
});

test('compress: image-heavy PDF gets much smaller and stays valid', async ({ page }) => {
  await page.goto('/compress');
  await page.getByLabel('Choose a PDF or drop it here').setInputFiles(fixture('images.pdf'));
  await page.getByLabel(/Balanced/).check();
  await page.getByRole('button', { name: 'Compress PDF' }).click();
  await expect(page.getByText(DONE)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('status').filter({ hasText: '% smaller' })).toBeVisible();
  const out = await download(page, /Download images-compressed\.pdf/);
  expect(out.length).toBeLessThan(statSync(fixture('images.pdf')).size * 0.3);
  expect((await PDFDocument.load(out)).getPageCount()).toBe(2);
});

test('compress: an encrypted PDF explains what to do', async ({ page }) => {
  await page.goto('/compress');
  await page.getByLabel('Choose a PDF or drop it here').setInputFiles(fixture('encrypted.pdf'));
  await page.getByRole('button', { name: 'Compress PDF' }).click();
  await expect(page.getByRole('alert')).toContainText('password-protected');
});
