# Plan: M6 Hardening and launch

## Scope

1. **Fuzzing**: a seeded mutation fuzzer that feeds mutated corpus files through every op; any
   error that is not a typed `PdfToolsError` (or an op exceeding its time budget) fails. A short
   deterministic pass runs in normal CI; a long randomly-seeded pass runs nightly and uploads
   crashing inputs as an artifact.
2. **Offline PWA**: generated service worker that precaches the app shell (HTML routes, JS, CSS,
   icons, manifest), caches WASM / pdf.js data / OCR files on first use, never activates a new
   version on its own, and an in-app "Reload for update" prompt that is disabled while any
   operation runs. Web app manifest and icons.
3. **Persuade surfaces** (hallmark, inside the existing DESIGN.md system): landing page at `/`
   and "How to verify we never upload your files" at `/privacy`. No invented metrics,
   testimonials, or logos. Per-route SEO metadata (title, description, canonical, Open Graph,
   Twitter card), generated OG images, sitemap, robots.txt.
4. **Lighthouse in CI**: Performance >= 90 and Accessibility = 100 on `/`, `/privacy`, and every
   tool page, against the production build.
5. **Security audit** (security-audit skill), output outside the repo, findings fixed with
   regression tests, and an explicit statement of what it could not cover.
6. **Launch readiness**: one site config (`apps/web/site.config.ts`) for name, domain, contacts,
   repository and analytics; analytics off by default, Cloudflare Web Analytics optional with
   its hosts added to the CSP only when enabled; Cloudflare Pages config and deploy runbook;
   release workflow with hashes and provenance; CI made ready for its first real run.
7. **docs/LAUNCH.md**: the owner's numbered checklist.

## Acceptance criteria and their tests

| # | Criterion | Automated test |
| --- | --- | --- |
| 1 | Fuzzer: every op, seeded, reproducible; only typed errors allowed | `pnpm fuzz` (CI short pass), `.github/workflows/fuzz.yml` (nightly); unit test of the mutator |
| 2 | Offline: load once, go offline, merge succeeds | `e2e/offline.spec.ts` |
| 3 | SW never swaps code mid-operation; update prompt appears for a waiting worker and is disabled while busy | `e2e/offline.spec.ts` (waiting worker simulated), unit test of the busy counter |
| 4 | Landing and privacy pages: CSP, zero uploads, axe clean, links to every tool, privacy page shows the live CSP | `e2e/pages.spec.ts`, `a11y.spec.ts`, `security.spec.ts` |
| 5 | Per-route metadata, canonical, OG image, sitemap, robots | `e2e/seo.spec.ts` against the build output |
| 6 | Site config: one place; analytics off by default; CSP gains the Cloudflare hosts only when enabled | `apps/web/site.config.test.ts`, `security-headers` unit tests |
| 7 | Lighthouse thresholds on every page | `scripts/lighthouse.ts` (CI job) |
| 8 | Security audit findings fixed | regression tests named after each finding |
| 9 | All previous acceptance criteria still pass | full unit + e2e suites |
