// Single source of truth for the response headers. Used by `vite preview` (and so by e2e),
// by the build to emit Cloudflare Pages `_headers`, and by the nginx image config.
import { CLOUDFLARE_ANALYTICS, type SiteConfig } from './site.config.ts';

type Analytics = SiteConfig['analytics'];

/** Strict CSP. Cloudflare Web Analytics hosts are added only when analytics are enabled. */
export function contentSecurityPolicy(analytics: Analytics = { provider: 'none' }): string {
  const cf = analytics.provider === 'cloudflare';
  return [
    "default-src 'self'",
    `connect-src 'self'${cf ? ` ${CLOUDFLARE_ANALYTICS.beacon}` : ''}`,
    `script-src 'self' 'wasm-unsafe-eval'${cf ? ` ${CLOUDFLARE_ANALYTICS.script}` : ''}`,
    "worker-src 'self' blob:",
    "style-src 'self'",
    "img-src 'self' blob: data:",
    "font-src 'self'",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'",
  ].join('; ');
}

export function securityHeaders(
  analytics: Analytics = { provider: 'none' },
): Record<string, string> {
  return {
    'Content-Security-Policy': contentSecurityPolicy(analytics),
    'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Resource-Policy': 'same-origin',
    'X-Frame-Options': 'DENY',
  };
}
