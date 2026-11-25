import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { PAGES, TOOLS } from '../src/tools.ts';
import { expect, fixture, test } from './fixtures.ts';

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

async function expectNoAxeViolations(page: Page) {
  // Full details for violations only: same rules and verdicts, but a much smaller result to pass
  // back from the page (large results crashed Firefox's content process on CI).
  const results = await new AxeBuilder({ page })
    .withTags(TAGS)
    .options({ resultTypes: ['violations'] })
    .analyze();
  expect(results.violations).toEqual([]);
}

for (const path of [...PAGES.map((p) => p.path), ...TOOLS.map((t) => t.path), '/no-such-tool']) {
  test(`no axe violations on ${path}`, async ({ page }) => {
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expectNoAxeViolations(page);
  });
}

// Firefox on CI crashes its page process inside the axe scan once a file has been processed
// (pages holding blob: images or download links). Cause not yet identified (docs/STATUS.md,
// Known gaps). These states are scanned in Chromium and WebKit; every page's empty state is
// still scanned in Firefox above.
const FIREFOX_AXE_CRASH = 'Firefox page process crashes during axe after processing (see STATUS)';

test('no axe violations on merge with files and a result', async ({ page, browserName }) => {
  test.skip(browserName === 'firefox', FIREFOX_AXE_CRASH);
  await page.goto('/merge');
  await page
    .getByLabel('Choose PDFs or drop them here')
    .setInputFiles([fixture('simple.pdf'), fixture('pdf-1.4.pdf')]);
  await expectNoAxeViolations(page);
  await page.getByRole('button', { name: 'Merge 2 PDFs' }).click();
  await expect(page.getByText('Done on this device. Nothing was uploaded.')).toBeVisible();
  await expectNoAxeViolations(page);
});

test('no axe violations on organize with thumbnails', async ({ page, browserName }) => {
  test.skip(browserName === 'firefox', FIREFOX_AXE_CRASH);
  await page.goto('/organize');
  await page.getByLabel('Choose a PDF or drop it here').setInputFiles(fixture('simple.pdf'));
  await expect(
    page.getByRole('list', { name: 'Pages, in output order' }).locator('img'),
  ).toHaveCount(3);
  await expectNoAxeViolations(page);
});
