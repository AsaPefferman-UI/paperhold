import { PDFDocument } from 'pdf-lib';
import { readFileSync } from 'node:fs';
import { expect, fixture, test } from './fixtures.ts';

const DONE = 'Done on this device. Nothing was uploaded.';

test.describe('merge', () => {
  test('merges files in the chosen order, entirely on this device', async ({ page }) => {
    await page.goto('/merge');
    await expect(page.getByRole('heading', { level: 1, name: 'Merge PDFs' })).toBeVisible();
    await page
      .getByLabel('Choose PDFs or drop them here')
      .setInputFiles([fixture('simple.pdf'), fixture('pdf-2.0.pdf')]);
    const list = page.getByRole('list', { name: 'Files to merge, in order' });
    await expect(list.getByRole('listitem')).toHaveCount(2);

    // Keyboard reorder: move the second file to the top.
    await page.getByRole('button', { name: 'Move pdf-2.0.pdf up' }).press('Enter');
    await expect(list.getByRole('listitem').first()).toContainText('pdf-2.0.pdf');

    await page.getByRole('button', { name: 'Merge 2 PDFs' }).click();
    await expect(page.getByText(DONE)).toBeVisible();
    const download = page.waitForEvent('download');
    await page.getByRole('link', { name: /Download merged\.pdf/ }).click();
    const merged = await PDFDocument.load(readFileSync(await (await download).path()));
    expect(merged.getPageCount()).toBe(5);
  });

  test('a damaged file gets a friendly, named error and the page keeps working', async ({
    page,
  }) => {
    await page.goto('/merge');
    await page
      .getByLabel('Choose PDFs or drop them here')
      .setInputFiles([fixture('simple.pdf'), fixture('not-a-pdf.pdf')]);
    await page.getByRole('button', { name: 'Merge 2 PDFs' }).click();
    await expect(page.getByRole('alert')).toContainText('not-a-pdf.pdf: This file is not a PDF.');
    await page.getByRole('button', { name: 'Remove not-a-pdf.pdf' }).click();
    await page.getByLabel('Choose PDFs or drop them here').setInputFiles([fixture('pdf-1.4.pdf')]);
    await page.getByRole('button', { name: 'Merge 2 PDFs' }).click();
    await expect(page.getByText(DONE)).toBeVisible();
  });

  test('refuses non-PDF files at the door', async ({ page }) => {
    await page.goto('/merge');
    await page.getByLabel('Choose PDFs or drop them here').setInputFiles({
      name: 'notes.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('hello'),
    });
    await expect(page.getByRole('alert')).toContainText('notes.txt');
    await expect(page.getByRole('button', { name: 'Merge PDFs' })).toBeDisabled();
  });

  test('full keyboard flow', async ({ page }) => {
    await page.goto('/merge');
    await page
      .getByLabel('Choose PDFs or drop them here')
      .setInputFiles([fixture('simple.pdf'), fixture('pdf-1.4.pdf'), fixture('pdf-2.0.pdf')]);
    const down = page.getByRole('button', { name: 'Move simple.pdf down' });
    await down.focus();
    await page.keyboard.press('Enter');
    await page.keyboard.press('Enter');
    const items = page
      .getByRole('list', { name: 'Files to merge, in order' })
      .getByRole('listitem');
    await expect(items.last()).toContainText('simple.pdf');
    await expect(down).toBeFocused();
    // Tab onwards to the primary action and run it with the keyboard.
    const merge = page.getByRole('button', { name: 'Merge 3 PDFs' });
    for (let i = 0; i < 20 && !(await merge.evaluate((el) => el === document.activeElement)); i++) {
      await page.keyboard.press('Tab');
    }
    await expect(merge).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.getByText(DONE)).toBeVisible();
  });
});
