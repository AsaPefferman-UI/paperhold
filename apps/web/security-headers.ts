// Single source of truth for the response headers. Used by `vite preview` (and so by e2e),
// by the build to emit Cloudflare Pages `_headers`, and by the nginx image config.

/** Set VITE_ANALYTICS_ORIGIN at build time to allow exactly one analytics origin. Default: none. */
export function contentSecurityPolicy(analyticsOrigin = ''): string {
  const connect = ["'self'", analyticsOrigin].filter(Boolean).join(' ');
  return [
    "default-src 'self'",
    `connect-src ${connect}`,
    "script-src 'self' 'wasm-unsafe-eval'",
    "worker-src 'self' blob:",
    "style-src 'self'",
    "img-src 'self' blob: data:",
    "font-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'",
  ].join('; ');
}

export function securityHeaders(analyticsOrigin = ''): Record<string, string> {
  return {
    'Content-Security-Policy': contentSecurityPolicy(analyticsOrigin),
    'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy':
      'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()',
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Resource-Policy': 'same-origin',
    'X-Frame-Options': 'DENY',
  };
}
