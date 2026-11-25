import type { Page } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, fixture, test } from './fixtures.ts';

const DONE = 'Done on this device. Nothing was uploaded.';
const SW_FILE = join(import.meta.dirname, '../dist/sw.js');

async function waitForServiceWorker(page: Page) {
  await page.evaluate(() => navigator.serviceWorker.ready);
  await expect
    .poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null), {
      timeout: 15_000,
    })
    .toBe(true);
}

test('works offline after the first visit: load once, go offline, merge', async ({
  page,
  context,
  browserName,
}) => {
  // Playwright's offline emulation in Firefox fails navigations (NS_ERROR_OFFLINE) before the
  // service worker can answer, so this can't be exercised there. Covered in Chromium and WebKit.
  test.skip(browserName === 'firefox', 'Playwright offline emulation bypasses service workers');
  await page.goto('/');
  await waitForServiceWorker(page);
  await context.setOffline(true);
  await page.goto('/merge');
  await page
    .getByLabel('Choose PDFs or drop them here')
    .setInputFiles([fixture('simple.pdf'), fixture('pdf-1.4.pdf')]);
  await page.getByRole('button', { name: 'Merge 2 PDFs' }).click();
  await expect(page.getByText(DONE)).toBeVisible();
  // Pages the user never opened online are available too (precached).
  await page.goto('/privacy');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('How to verify');
  await context.setOffline(false);
});

test('a new version waits, and the update button is disabled while a task runs', async ({
  page,
  browserName,
}) => {
  // One browser only: the test rewrites the shared dist/sw.js while it runs.
  test.skip(browserName !== 'chromium', 'Runs once, in Chromium');
  await page.goto('/ocr');
  await waitForServiceWorker(page);

  // Start a long task, then publish a "new" service worker.
  await page
    .getByLabel('Choose a PDF or drop it here')
    .setInputFiles(fixture('large-page-count.pdf'));
  await page.getByRole('button', { name: 'Make searchable' }).click();
  await expect(page.getByText(/Read \d+ of 1000 pages/)).toBeVisible({ timeout: 60_000 });
  // Publish a "new" version by changing the served sw.js on disk (restored below).
  const original = readFileSync(SW_FILE, 'utf8');
  writeFileSync(SW_FILE, `${original}\n// next version\n`);
  try {
    await page.evaluate(async () => (await navigator.serviceWorker.getRegistration())?.update());
  } finally {
    writeFileSync(SW_FILE, original);
  }

  const reload = page.getByRole('button', { name: 'Reload for update' });
  await expect(reload).toBeVisible({ timeout: 15_000 });
  await expect(reload).toBeDisabled();
  await expect(page.getByText('Available when the current task finishes.')).toBeVisible();
  // The running task is untouched: still the old code, still making progress.
  await expect(page.getByText(/Read \d+ of 1000 pages/)).toBeVisible();

  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(reload).toBeEnabled();
  await Promise.all([page.waitForEvent('load'), reload.click()]);
  await expect(page.getByRole('button', { name: 'Reload for update' })).toHaveCount(0);
});
