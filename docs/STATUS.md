# Status

Last updated: November 2026. All six milestones are done, the product is named **Paperhold**
(paperhold.app), the repository is public at github.com/AsaPefferman-UI/paperhold, and CI is
green on `main`. What remains before public launch is owner setup in [LAUNCH.md](LAUNCH.md)
(domain, mailboxes, Cloudflare, first release) and the human checks listed below.

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

## Verified in CI (GitHub Actions, ubuntu-latest)

All jobs pass on `main`: typecheck, lint, unit tests, coverage, short fuzz pass, build; e2e on
**Chromium, Firefox and WebKit**; Lighthouse on every page; gitleaks (full history),
`pnpm audit`, licence allowlist; self-host Docker image build and Trivy scan (0 HIGH/CRITICAL);
CodeQL. The first runs needed fixes, recorded in the CHANGELOG: a reviewed gitleaks false
positive, nginx mainline plus `apk upgrade` for Trivy, a crash-only retry in the Lighthouse
script, and the Firefox quarantine below.

Not runnable on the original dev machine (Windows): Firefox (`spawn UNKNOWN`) and Docker. Both
run in CI.

## Known gaps

- The security audit could not execute code (no OS sandbox), cover WASM internals, or see
  deployment settings that live in GitHub/Cloudflare (`docs/security-review.md`). Its prose
  reports were not written (permission refusal in the sub-agent); the structured records are in
  `~/security-audit-skill/pdf-tools/run-1/`.
- HEIC (HEVC) has no automated test with a real photo (no licence-clean sample).
- Firefox on CI (first GitHub runs, Nov 2026): Firefox's page process crashes inside the axe scan
  on random pages, a different set each run, empty pages included. All axe scans are quarantined
  in Firefox and still run in Chromium and WebKit; every functional test runs in Firefox. Cause
  not identified; next step is a minimal repro (axe on a static page in Playwright Firefox on
  ubuntu-latest) to report upstream. The offline test is also skipped in Firefox because
  Playwright's offline emulation fails navigations before the service worker answers.
- OCR and watermark/page numbers/forms: Latin-script text only. Pages that already contain text
  are OCR'd again.
- Performance targets in SPEC §7 (50 MB scan compress < 20 s, 3 s/page OCR on real scans) are
  not measured on real-world files.
- Manual release check (SPEC §12.1: outputs open in Acrobat Reader, Chrome, macOS Preview) is a
  human step in LAUNCH.md.
- Batch mode (one operation over several files) is not offered for single-file tools.

## Open questions for the owner

1. Analytics: keep none (default) or enable Cloudflare Web Analytics.
2. Socket.dev (or similar) for pull-request dependency review.
3. Brand: confirm or replace the manila-folder visual direction (`DESIGN.md`).
4. A HEIC photo you own and are happy to publish, for the test corpus.

## Next step

Continue [LAUNCH.md](LAUNCH.md) from section A step 4 (mailboxes) once paperhold.app is
registered, then sections C to E.
