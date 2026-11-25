# Status

Last updated: M6 complete. All six milestones are done; what remains before public launch is
owner setup ([LAUNCH.md](LAUNCH.md)) and the checks below that only CI or a human can do.

## Milestones

| Milestone | State |
| --- | --- |
| M1 Foundation (app, worker protocol, CSP, CI, fixtures, deploy config) + Merge | Done |
| M2 Page tools (split, organize, page numbers, watermark) | Done |
| M3 Convert (images to PDF incl. HEIC, PDF to images, compress) | Done |
| M4 Forms and sign (fill/flatten, visual signature, protect/unlock) | Done |
| M5 OCR (searchable PDFs, integrity-checked self-hosted engine) | Done |
| M6 Hardening and launch (fuzzing, offline PWA, landing and privacy pages, SEO, Lighthouse, security audit, launch config) | Done |

## Verified locally (Windows 11, Node 24.19)

- `pnpm typecheck`, `pnpm lint` (ESLint strict, zero warnings, Prettier), `pnpm test` (core,
  web and scripts projects), core coverage above 80%, `pnpm build`, licence allowlist,
  `pnpm audit --audit-level=high` (1 moderate, 0 high).
- Golden image tests (pdf.js + @napi-rs/canvas in Node) for page numbers, watermark, rotated
  images, compression, flattened forms and signatures. Real tesseract-core OCR in Node.
- Fuzzing (each case in a worker thread killed after 20 s): the CI pass (520 runs, fixed seed),
  a 5,200-run pass with seed 777, and a 26,000-run random-seed pass, all with 0 failures. The
  first long runs found two hangs (absurd xref stream field widths; a truncated PNG); both are
  fixed, with regression fixtures in `packages/core/fixtures/regressions/`.
- E2E on **Chromium and WebKit**: every tool's happy path and main error paths, landing and
  privacy pages, per-route SEO metadata, sitemap, robots, manifest, 404 handling, offline (load
  once, go offline, merge, open an unvisited page), the update prompt (waits, is disabled while
  OCR runs, applies after), OCR integrity refusal, axe on every route, CSP header on every route,
  CSP blocks exfiltration, network guard and its self-test.
- Lighthouse (mobile defaults, Playwright's headless Chromium), all 15 pages: accessibility 100
  everywhere; performance 97-100 (lowest: `/privacy` 97).
- Hallmark sloplint on the landing and privacy pages: 0 FAIL (one WARN waived on record: the
  privacy page's H1 is the title the brief names). The render tier needs puppeteer-core, which is
  not installed, so pages were inspected from Playwright screenshots instead.
- Impeccable detector on all UI files: no findings.
- Security audit (security-audit skill, quick profile, source-only): 0 confirmed findings; two
  needs-validation leads and two hardening notes, all addressed (`docs/security-review.md`).

## Verified only in CI (not runnable on this machine)

- **Firefox e2e**: Playwright's Firefox fails to launch here (`spawn UNKNOWN`, likely local
  security software). It is in the CI matrix.
- **Docker image** build, smoke test and Trivy scan (Docker is not installed locally).
- gitleaks, CodeQL, dependency review (GitHub-hosted).
- Locally, WebKit browser launches occasionally failed (1 ms test failures) when the e2e
  suite ran alongside a long fuzz run; with the machine idle the full suite passes.
- **Nothing has been pushed, so CI has never actually run.** First-run risks to watch: Firefox
  (never run), Linux rendering differences in golden-image tests (1% pixel tolerance), and
  Lighthouse scores on CI hardware.

## Known gaps

- The security audit could not execute code (no OS sandbox), cover WASM internals, or see
  deployment settings that live in GitHub/Cloudflare (`docs/security-review.md`). Its prose
  reports were not written (permission refusal in the sub-agent); the structured records are in
  `~/security-audit-skill/pdf-tools/run-1/`.
- HEIC (HEVC) has no automated test with a real photo (no licence-clean sample).
- Firefox on CI (first GitHub runs, Nov 2026): the page process crashes inside the axe scan once a
  file has been processed (merge result, organize thumbnails), even with small files. Those two
  axe states are skipped in Firefox and still run in Chromium and WebKit; the tools' functional
  tests pass in Firefox. Cause not identified (suspect blob: URLs during Playwright's
  frame.evaluate). The offline test is also skipped in Firefox because Playwright's offline
  emulation fails navigations before the service worker answers.
- OCR and watermark/page numbers/forms: Latin-script text only. Pages that already contain text
  are OCR'd again.
- Performance targets in SPEC §7 (50 MB scan compress < 20 s, 3 s/page OCR on real scans) are
  not measured on real-world files.
- Manual release check (SPEC §12.1: outputs open in Acrobat Reader, Chrome, macOS Preview) is a
  human step in LAUNCH.md.
- Batch mode (one operation over several files) is not offered for single-file tools.

## Open questions for the owner

1. Product name and domain, contact mailboxes (all in `apps/web/site.config.ts`).
2. Analytics: keep none (default) or enable Cloudflare Web Analytics.
3. Cloudflare account, Pages project, GitHub environments and secrets (LAUNCH.md C-D).
4. Socket.dev (or similar) for pull-request dependency review.
5. Brand: confirm or replace the manila-folder visual direction (`DESIGN.md`).
6. A HEIC photo you own and are happy to publish, for the test corpus.

## Next step

Follow [docs/LAUNCH.md](LAUNCH.md) from step 1. The first real milestone is the first green CI
run on GitHub (step 7).
