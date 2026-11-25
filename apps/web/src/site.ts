import type { SiteConfig } from '../site.config.ts';

export type PublicSite = Omit<SiteConfig, 'analytics'> & {
  analytics: { provider: SiteConfig['analytics']['provider'] };
};

/** Public site settings, resolved at build time from site.config.ts (no secrets in here). */
export const SITE: PublicSite = __SITE__;
