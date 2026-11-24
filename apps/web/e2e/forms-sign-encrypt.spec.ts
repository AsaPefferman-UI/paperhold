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

test('fill form: every field type, then flatten', async ({ page }) => {
  await page.goto('/fill-form');
  await page.getByLabel('Choose a PDF form or drop it here').setInputFiles(fixture('acroform.pdf'));
  await page.getByLabel('full_name').fill('Ada Lovelace');
  await page.getByLabel('agree').check();
  await page.getByLabel('color').selectOption('Blue');
  await page.getByRole('radio', { name: 'M' }).check();
  await page.getByLabel('notes').fill('First line\nSecond line');
  await page.getByRole('button', { name: 'Save filled PDF' }).click();
  await expect(page.getByText(DONE)).toBeVisible();
  const form = (
    await PDFDocument.load(await download(page, /Download acroform-filled\.pdf/))
  ).getForm();
  expect(form.getTextField('full_name').getText()).toBe('Ada Lovelace');
  expect(form.getCheckBox('agree').isChecked()).toBe(true);
  expect(form.getRadioGroup('size').getSelected()).toBe('M');

  await page.getByLabel(/Flatten/).check(); // changing an option clears the previous result
  await page.getByRole('button', { name: 'Save flattened PDF' }).click();
  const flat = await PDFDocument.load(await download(page, /Download acroform-flattened\.pdf/));
  expect(flat.getForm().getFields()).toHaveLength(0);
});

test('fill form: a PDF without fields says so', async ({ page }) => {
  await page.goto('/fill-form');
  await page.getByLabel('Choose a PDF form or drop it here').setInputFiles(fixture('simple.pdf'));
  await expect(page.getByRole('alert')).toContainText('no fillable fields');
  await expect(page.getByRole('button', { name: 'Save filled PDF' })).toBeDisabled();
});

test('sign: draw, place with the keyboard, remember, and forget', async ({ page }) => {
  await page.goto('/sign');
  await expect(page.getByRole('note')).toContainText(
    'not a certified or cryptographic e-signature',
  );
  await page.getByLabel('Choose a PDF or drop it here').setInputFiles(fixture('simple.pdf'));
  await expect(page.getByRole('img', { name: 'Page 1' })).toBeVisible();

  // Draw a stroke on the pad.
  const pad = page.getByRole('img', { name: /Signature drawing area/ });
  await pad.scrollIntoViewIfNeeded();
  const box = (await pad.boundingBox())!;
  await page.mouse.move(box.x + 20, box.y + box.height * 0.7);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.4, box.y + 20, { steps: 8 });
  await page.mouse.move(box.x + box.width - 20, box.y + box.height * 0.5, { steps: 8 });
  await page.mouse.up();

  const sig = page.getByRole('slider', { name: /Signature position/ });
  await expect(sig).toBeVisible();
  await sig.focus();
  await page.keyboard.press('Shift+ArrowLeft');
  await page.keyboard.press('+');
  await page.getByLabel(/Remember this signature/).check();
  await page.getByRole('button', { name: 'Add signature' }).click();
  await expect(page.getByText(DONE)).toBeVisible();
  const signed = await PDFDocument.load(await download(page, /Download simple-signed\.pdf/));
  expect(signed.getPageCount()).toBe(3);

  // Saved locally: a reload offers it; "Forget" removes it.
  await page.reload();
  await expect(page.getByLabel('Use my saved signature')).toBeChecked();
  await page.getByRole('button', { name: 'Forget my signature' }).click();
  await expect(page.getByLabel('Use my saved signature')).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Forget my signature' })).toHaveCount(0);
});

test('sign: a typed signature on every page', async ({ page }) => {
  await page.goto('/sign');
  await page.getByLabel('Choose a PDF or drop it here').setInputFiles(fixture('simple.pdf'));
  await page.getByRole('radio', { name: 'Type' }).check();
  await page.getByLabel('Your name').fill('Ada Lovelace');
  await page.getByLabel('Same place on every page').check();
  await page.getByRole('button', { name: 'Add signature' }).click();
  await expect(page.getByText(DONE)).toBeVisible();
});

test('protect then unlock, with a wrong-password message in between', async ({ page }) => {
  await page.goto('/protect');
  await page.getByLabel('Choose a PDF or drop it here').setInputFiles(fixture('simple.pdf'));
  await page.getByLabel('Password', { exact: true }).fill('correct horse battery');
  await page.getByLabel('Type it again').fill('correct horse');
  await expect(page.getByText('The passwords do not match.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Protect PDF' })).toBeDisabled();
  await page.getByLabel('Type it again').fill('correct horse battery');
  await page.getByLabel('Copy text and images').uncheck();
  await page.getByRole('button', { name: 'Protect PDF' }).click();
  await expect(page.getByText(DONE)).toBeVisible();
  const locked = await download(page, /Download simple-protected\.pdf/);
  expect(locked.includes(Buffer.from('/Encrypt'))).toBe(true);
  await expect(PDFDocument.load(locked)).rejects.toThrow(/encrypted/);

  await page.goto('/unlock');
  await page.getByLabel('Choose a PDF or drop it here').setInputFiles({
    name: 'simple-protected.pdf',
    mimeType: 'application/pdf',
    buffer: locked,
  });
  await page.getByLabel('Password', { exact: true }).fill('wrong');
  await page.getByRole('button', { name: 'Remove password' }).click();
  await expect(page.getByRole('alert')).toContainText('password is not correct');
  await page.getByLabel('Password', { exact: true }).fill('correct horse battery');
  await page.getByRole('button', { name: 'Remove password' }).click();
  await expect(page.getByText(DONE)).toBeVisible();
  const unlocked = await PDFDocument.load(
    await download(page, /Download simple-protected-unlocked\.pdf/),
  );
  expect(unlocked.getPageCount()).toBe(3);
});

test('unlock: a PDF without a password is explained', async ({ page }) => {
  await page.goto('/unlock');
  await page.getByLabel('Choose a PDF or drop it here').setInputFiles(fixture('simple.pdf'));
  await page.getByRole('button', { name: 'Remove password' }).click();
  await expect(page.getByRole('alert')).toContainText('not password-protected');
});
