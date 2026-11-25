import { describe, expect, it } from 'vitest';
import { contentSecurityPolicy } from './security-headers.ts';
import { placeholders, resolveSite, SITE_CONFIG } from './site.config.ts';

describe('site config', () => {
  it('ships with analytics off and a CSP that only allows our origin', () => {
    const site = resolveSite({});
    expect(site.analytics).toEqual({ provider: 'none' });
    const csp = contentSecurityPolicy(site.analytics);
    expect(csp).toContain("connect-src 'self';");
    expect(csp).not.toContain('cloudflareinsights');
  });

  it('adds exactly the Cloudflare analytics hosts when a token is configured', () => {
    const site = resolveSite({ SITE_CF_ANALYTICS_TOKEN: 'abcdef0123456789abcdef0123456789' });
    const csp = contentSecurityPolicy(site.analytics);
    expect(csp).toContain("connect-src 'self' https://cloudflareinsights.com;");
    expect(csp).toContain(
      "script-src 'self' 'wasm-unsafe-eval' https://static.cloudflareinsights.com;",
    );
  });

  it('validates overrides', () => {
    expect(() => resolveSite({ SITE_CF_ANALYTICS_TOKEN: 'x"><script>' })).toThrow(/token/);
    expect(() => resolveSite({ SITE_URL: 'http://insecure.test' })).toThrow(/https/);
    expect(resolveSite({ SITE_URL: 'https://pdf.example.org/' }).url).toBe(
      'https://pdf.example.org',
    );
  });

  it('lists the placeholders that must be replaced before launch', () => {
    expect(
      placeholders({
        ...SITE_CONFIG,
        url: 'https://pdf-tools.example',
        repoUrl: 'https://github.com/OWNER/pdf-tools',
        contact: { security: 'security@pdf-tools.example', conduct: 'conduct@pdf-tools.example' },
      }),
    ).toEqual(['url', 'repoUrl', 'contact.security', 'contact.conduct']);
  });

  it('ships the real Paperhold config with no placeholders left', () => {
    expect(placeholders(SITE_CONFIG)).toEqual([]);
    expect(resolveSite({}).url).toBe('https://paperhold.app');
  });
});
