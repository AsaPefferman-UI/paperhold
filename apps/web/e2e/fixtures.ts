// Every e2e test runs under these guards:
//  1. No request may leave our origin, use a non-GET method, or carry a body over 1 KB.
//  2. Zero CSP violations.
// Together they make the privacy claim ("your files are never uploaded") a build-breaking test.
import { test as base, expect, type Request } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export const FIXTURES = join(import.meta.dirname, '../../../packages/core/fixtures/corpus');
export const fixture = (name: string) => join(FIXTURES, name);
export const fixtureBytes = (name: string) => readFileSync(fixture(name));

export interface Violation {
  url: string;
  reason: string;
}

export const test = base.extend<{ guard: Violation[] }>({
  guard: [
    async ({ context, page, baseURL }, use) => {
      const origin = new URL(baseURL!).origin;
      const violations: Violation[] = [];
      const inspect = (req: Request) => {
        const url = req.url();
        if (url.startsWith('blob:') || url.startsWith('data:')) return;
        if (new URL(url).origin !== origin) violations.push({ url, reason: 'foreign host' });
        const body = req.postDataBuffer();
        if (body && body.length > 1024) violations.push({ url, reason: `body ${body.length} B` });
        if (req.method() !== 'GET' && req.method() !== 'HEAD') {
          violations.push({ url, reason: `method ${req.method()}` });
        }
      };
      context.on('request', inspect);
      // Belt and braces: anything foreign is aborted, so a regression cannot leak even once.
      await context.route(
        (url) => url.origin !== origin,
        (route) => route.abort('blockedbyclient'),
      );
      await page.addInitScript(() => {
        const list: string[] = [];
        (window as unknown as { __csp: string[] }).__csp = list;
        document.addEventListener('securitypolicyviolation', (e) =>
          list.push(`${e.violatedDirective} ${e.blockedURI}`),
        );
      });
      const consoleCsp: string[] = [];
      page.on('console', (msg) => {
        if (/content security policy/i.test(msg.text())) consoleCsp.push(msg.text());
      });

      await use(violations);

      expect(violations, 'requests that left the origin or carried a body').toEqual([]);
      const csp = await page
        .evaluate(() => (window as unknown as { __csp?: string[] }).__csp ?? [])
        .catch(() => [] as string[]);
      expect([...csp, ...consoleCsp], 'CSP violations').toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };
