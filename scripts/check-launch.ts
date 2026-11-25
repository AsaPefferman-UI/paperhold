// Fails while apps/web/site.config.ts still contains placeholders (run by the release workflow).
import { placeholders, resolveSite } from '../apps/web/site.config.ts';

const site = resolveSite(process.env);
const left = placeholders(site);
if (left.length) {
  console.error(
    `Replace these placeholders in apps/web/site.config.ts before launch: ${left.join(', ')}`,
  );
  process.exit(1);
}
console.info(
  `Launch config OK: ${site.name} at ${site.url} (analytics: ${site.analytics.provider})`,
);
