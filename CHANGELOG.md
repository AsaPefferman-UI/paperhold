# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- Product named **Paperhold** (paperhold.app): launch config, Cloudflare project, docs, icons and
  social images. Release artifact renamed to `paperhold-site.tar.gz`.
- Tool routes moved to `apps/web/src/routes.tsx`, with a test that every tool has a route.
- CI fixes from the first GitHub runs: reviewed gitleaks false positive ignored by fingerprint;
  self-host image on nginx mainline with `apk upgrade` (Trivy clean); Lighthouse retries only on
  tool crashes; axe scans quarantined in Firefox (page-process crash, see `docs/STATUS.md`);
  offline test skipped in Firefox (Playwright limitation); slower CI WebKit allowed more time for
  the 1000-page thumbnail test.

- Styles split by job: `src/styles/` (tokens, base, shared components, layout utilities) plus a
  CSS file beside each component that owns styles, ordered with cascade layers declared once in
  `src/styles/index.css`. Native nesting for states and children; `.stack` and `.cluster` layout
  helpers. Tool-only CSS now ships with its lazy tool chunk (home page CSS 18.6 KB to 12.9 KB).
  Pixel-identical on every page in light and dark at desktop and phone widths, except the
  primary hover colour, now derived with `color-mix(in oklab, ...)` (contrast 9.2 light, 10.0 dark).

### Documentation

- New `docs/ARCHITECTURE.md` (maintainer guide: request flow, adding a tool, engine upgrades,
  testing layers) and `docs/README.md` (index of current vs historical docs). `SPEC.md` and
  `STANDARDS.md` marked historical. `docs/STATUS.md` and `docs/LAUNCH.md` brought up to date.

### Added

- M1 foundation: Vite + React app, typed worker protocol and worker pool with timeouts and
  cancel, strict CSP and security headers, synthetic fixture corpus, CI pipeline, self-host
  Docker image.
- Merge PDFs tool (drag or keyboard to reorder).
- M2 page tools: Split (extract, per range, every N pages; zip for many files), Organize
  pages (thumbnail grid: reorder, rotate, delete), Page numbers, Watermark.
- Self-hosted pdf.js data files (fonts, CMaps, image decoders) under a versioned path.
- M3 convert tools: Images to PDF (JPG, PNG, HEIC/AVIF via libheif WASM, WebP/GIF/BMP via the
  browser; EXIF rotation honoured), PDF to images (PNG/JPG, zip), Compress (three presets:
  image re-encoding plus qpdf object streams).
- Canvas fallback for browsers without OffscreenCanvas in workers.
- M4: Fill form (all AcroForm field types, optional flatten), Sign (visual signature: draw,
  type or upload; drag or keyboard placement; opt-in saved signature with Forget), Protect and
  Unlock (qpdf, AES-256 only).
- M5: OCR (make searchable): tesseract.js-core WASM in a dedicated worker, self-hosted engine and
  language data (English, German, French, Spanish) checked against SHA-256 hashes compiled into
  the app, invisible text layer, progress with time left, cancel.
- M6 launch hardening:
  - Landing page and "How to verify we never upload your files" page; per-route titles,
    descriptions, canonical URLs, Open Graph images, sitemap, robots.txt, web app manifest.
  - Offline support: service worker precaches the app shell and caches engines on first use;
    "Reload for update" prompt that never swaps code while a file is being processed.
  - One site config (`apps/web/site.config.ts`) for name, domain, contacts and analytics;
    analytics off by default (optional Cloudflare Web Analytics, CSP widened only when enabled).
  - Mutation fuzzer over every operation (short pass in CI, nightly long pass).
  - Lighthouse gate in CI (performance >= 90, accessibility = 100 on every page).
  - Release workflow gated by a reviewed environment and a `main` check; Cloudflare Pages
    config, deploy runbook and launch checklist.

### Fixed

- Protect now repairs slightly damaged PDFs (pdf-lib) before encrypting, instead of failing.
- Compress caps decompressed image size at the image's declared dimensions.
- Fill form handles field names such as `__proto__` safely.
- Two inputs found by fuzzing that made pdf-lib spin (a cross-reference stream with absurd
  field widths, a truncated PNG) are now rejected immediately with a clear error.
