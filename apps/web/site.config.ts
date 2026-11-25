// ─────────────────────────────────────────────────────────────────────────────────────────────
// THE ONE PLACE TO RENAME AND CONFIGURE THE SITE.
// Every value marked PLACEHOLDER must be replaced before launch (docs/LAUNCH.md, step 1).
// `pnpm check:launch` fails while any placeholder remains; the release workflow runs it.
// Build-time environment variables (below) override the file, so a fork can deploy without
// editing it.
// ─────────────────────────────────────────────────────────────────────────────────────────────

export interface SiteConfig {
  /** Product name shown in the header, titles, manifest, and OG images. */
  name: string;
  /** One sentence used on the home page and as the default description. */
  tagline: string;
  /** Production origin, no trailing slash. Used for canonical URLs, sitemap, and OG tags. */
  url: string;
  /** Public source repository (AGPL requires offering the source to users). */
  repoUrl: string;
  contact: {
    /** Where vulnerability reports go if GitHub advisories are unavailable. */
    security: string;
    /** Code of conduct reports. */
    conduct: string;
  };
  analytics:
    | { provider: 'none' }
    /** Cloudflare Web Analytics: cookieless, counts page views only. Token from the CF dashboard. */
    | { provider: 'cloudflare'; token: string };
}

export const SITE_CONFIG: SiteConfig = {
  name: 'pdf-tools', // PLACEHOLDER: product name
  tagline: 'Free PDF tools that never upload your files.',
  url: 'https://pdf-tools.example', // PLACEHOLDER: production origin
  repoUrl: 'https://github.com/OWNER/pdf-tools', // PLACEHOLDER: public repository
  contact: {
    security: 'security@pdf-tools.example', // PLACEHOLDER
    conduct: 'conduct@pdf-tools.example', // PLACEHOLDER
  },
  // Analytics are OFF unless you opt in. To enable Cloudflare Web Analytics:
  //   analytics: { provider: 'cloudflare', token: '<beacon token>' },
  // or set SITE_CF_ANALYTICS_TOKEN at build time.
  analytics: { provider: 'none' },
};

/** Cloudflare Web Analytics hosts, allowed by the CSP only when analytics are enabled. */
export const CLOUDFLARE_ANALYTICS = {
  script: 'https://static.cloudflareinsights.com',
  beacon: 'https://cloudflareinsights.com',
} as const;

/** Apply build-time overrides: SITE_NAME, SITE_URL, SITE_REPO_URL, SITE_CF_ANALYTICS_TOKEN. */
export function resolveSite(env: Record<string, string | undefined> = {}): SiteConfig {
  const token = env.SITE_CF_ANALYTICS_TOKEN?.trim();
  const site: SiteConfig = {
    ...SITE_CONFIG,
    name: env.SITE_NAME?.trim() || SITE_CONFIG.name,
    url: (env.SITE_URL?.trim() || SITE_CONFIG.url).replace(/\/+$/, ''),
    repoUrl: env.SITE_REPO_URL?.trim() || SITE_CONFIG.repoUrl,
    analytics: token ? { provider: 'cloudflare', token } : SITE_CONFIG.analytics,
  };
  if (
    site.analytics.provider === 'cloudflare' &&
    !/^[A-Za-z0-9]{16,64}$/.test(site.analytics.token)
  ) {
    throw new Error('Cloudflare Web Analytics token must be 16-64 letters and digits.');
  }
  if (!/^https:\/\/[^/\s]+$/.test(site.url)) throw new Error('Site url must be an https origin.');
  return site;
}

/** Values still set to a placeholder (empty when ready to launch). */
export function placeholders(site: SiteConfig): string[] {
  const bad: string[] = [];
  if (/\.example\b/.test(site.url)) bad.push('url');
  if (/\/OWNER\//.test(site.repoUrl)) bad.push('repoUrl');
  if (/\.example\b/.test(site.contact.security)) bad.push('contact.security');
  if (/\.example\b/.test(site.contact.conduct)) bad.push('contact.conduct');
  return bad;
}
