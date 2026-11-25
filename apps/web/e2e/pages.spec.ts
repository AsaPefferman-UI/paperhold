import { contentSecurityPolicy } from '../security-headers.ts';
import { PAGES, slugOf, TOOLS } from '../src/tools.ts';
import { expect, test } from './fixtures.ts';

test('landing page: the promise, a link to every tool, and the real policy line', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'Your PDFs never leave this tab',
  );
  for (const tool of TOOLS) {
    await expect(
      page
        .locator('#tools')
        .getByRole('link', { name: new RegExp(tool.name.replace(/[()]/g, '.')) })
        .first(),
    ).toHaveAttribute('href', tool.path);
  }
  await expect(page.locator('.proof code')).toHaveText("connect-src 'self'");
  await page.getByRole('link', { name: 'Check it yourself' }).click();
  await expect(page).toHaveURL(/\/privacy$/);
});

test('privacy page shows exactly the policy the server sends', async ({ page, request }) => {
  const header = (await request.get('/privacy')).headers()['content-security-policy'];
  expect(header).toBe(contentSecurityPolicy());
  await page.goto('/privacy');
  const shown = (await page.locator('.policy code').textContent())!.replace(/;\n/g, '; ');
  expect(shown).toBe(header);
  await expect(page.getByText('This site runs no analytics at all.')).toBeVisible();
});

test('every route has its own title, description, canonical URL and OG image', async ({
  request,
}) => {
  for (const { path } of [...PAGES, ...TOOLS]) {
    const html = await (await request.get(path)).text();
    const title = /<title>([^<]+)<\/title>/.exec(html)?.[1];
    expect(title, path).toBeTruthy();
    expect(html, path).toMatch(/<meta name="description" content="[^"]{20,}"/);
    expect(html, path).toContain(`<link rel="canonical" href="https://pdf-tools.example${path}"`);
    expect(html, path).toContain(`/og/${slugOf(path)}.png`);
    const og = await request.get(`/og/${slugOf(path)}.png`);
    expect(og.headers()['content-type']).toContain('image/png');
  }
});

test('sitemap, robots and web manifest', async ({ request }) => {
  const sitemap = await (await request.get('/sitemap.xml')).text();
  for (const { path } of [...PAGES, ...TOOLS])
    expect(sitemap).toContain(`<loc>https://pdf-tools.example${path}</loc>`);
  const robots = await (await request.get('/robots.txt')).text();
  expect(robots).toContain('Sitemap: https://pdf-tools.example/sitemap.xml');
  const manifest = await (await request.get('/manifest.webmanifest')).json();
  expect(manifest).toMatchObject({ start_url: '/', display: 'standalone' });
  expect(manifest.icons.map((i: { sizes: string }) => i.sizes)).toEqual(
    expect.arrayContaining(['192x192', '512x512']),
  );
});

test('unknown paths get the 404 page, marked noindex', async ({ page, request }) => {
  const res = await request.get('/definitely-not-here');
  expect(res.status()).toBe(404);
  expect(await res.text()).toContain('<meta name="robots" content="noindex" />');
  await page.goto('/definitely-not-here');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Page not found');
});
