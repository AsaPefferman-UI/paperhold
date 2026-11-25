# Spec 03 — PDF Tools (free alternative to Adobe Acrobat / Smallpdf / iLovePDF)

> **Historical document.** This is the original build specification for Paperhold (codename
> `pdf-tools`). It is kept because ADRs and tests cite its section numbers; it is not maintained.
> For how the app works today, read [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) and
> [docs/STATUS.md](docs/STATUS.md).

> Codename `pdf-tools` is a placeholder. Read `../STANDARDS.md` first. **This spec overrides STANDARDS in one big way: there is no backend for file processing.** Every operation runs in the user's browser. There is no database, no accounts, and no upload, so the auth, tenancy, and upload sections of STANDARDS don't apply. The CI, supply-chain, testing, accessibility, and release sections apply in full.

## 1. Summary

A fast, private PDF toolkit that runs **entirely on the user's device** using WebAssembly. Files never leave the browser. That's both the product pitch ("we literally can't see your files") and the business model: hosting cost is a static site on a CDN, so it can be free forever at any scale.

## 2. Users and jobs

Anyone who needs to merge, split, compress, sign, or convert a PDF without installing software, paying, or uploading a sensitive document (tax forms, contracts, medical records) to a stranger's server.

## 3. Scope

**MVP (must)** — each tool is its own route (`/merge`, `/split`, ...) for SEO and works offline after first load.

| Tool                                                                   | Library (suggested)                                                                                        |
| ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Merge PDFs (drag to reorder files)                                     | pdf-lib                                                                                                    |
| Split / extract pages (ranges, every N pages)                          | pdf-lib                                                                                                    |
| Reorder, rotate, delete pages (thumbnail grid, drag and drop)          | pdf-lib + pdf.js for thumbnails                                                                            |
| Compress (presets: high quality / balanced / smallest)                 | Re-encode embedded images via canvas/WebCodecs + pdf-lib; optional qpdf-wasm for object stream compression |
| Images → PDF (JPG, PNG, HEIC via WASM decoder)                         | pdf-lib                                                                                                    |
| PDF → images (PNG/JPG per page, zip download)                          | pdf.js + fflate for zip                                                                                    |
| Add page numbers / text watermark                                      | pdf-lib                                                                                                    |
| Fill forms (AcroForm) and flatten                                      | pdf-lib                                                                                                    |
| Visual signature: draw, type, or upload signature image, place on page | pdf-lib                                                                                                    |
| Protect with password / remove password (user supplies it)             | qpdf-wasm                                                                                                  |
| OCR: make scanned PDF searchable                                       | tesseract.js (in a Web Worker), language packs loaded on demand                                            |

Cross-cutting:

- Drag-and-drop or file picker; batch processing where it makes sense.
- Progress bar with cancel for any operation >1s.
- All heavy work in Web Workers so the UI never freezes.
- Installable PWA, fully offline after first visit (service worker precaches the app shell; WASM modules cached on first use).
- Download result via `Blob` + object URL; no server round trip.

**v2 (should)**

- Edit existing text (limited, Latin fonts).
- Redaction (true removal of underlying content, not black boxes; must verify text is gone).
- PDF/A conversion, compare two PDFs.
- Desktop app wrapper (Tauri) using the same code.

**Out of scope**

- Accounts, cloud storage, legally binding e-signatures with audit trail (label the signature tool as a "visual signature" and say it is not a certified e-signature).

## 4. Architecture

```
Cloudflare Pages (static) ──> browser
                               ├── UI thread (React): file picking, thumbnails, controls
                               ├── Worker pool (navigator.hardwareConcurrency - 1, max 4)
                               │     ├── pdf-lib ops
                               │     ├── qpdf.wasm
                               │     ├── tesseract.wasm
                               │     └── image re-encode (OffscreenCanvas)
                               └── Service worker: precache + offline
```

- Stack: Vite + React + TypeScript (strict). No Next.js server needed; a static build is simpler and more dependable. `packages/core` holds pure PDF operations with a typed message protocol (`{op, args, transfer}`), so ops are unit-testable in Node.
- Transfer `ArrayBuffer`s to workers (zero-copy), never structured-clone large files.
- Memory: detect file size up front; warn above 200 MB; refuse above a configurable cap (default 1 GB) with a clear message. Process page-by-page where the library allows.
- All WASM binaries and OCR language data are **self-hosted** on our origin (no third-party CDNs at runtime), with SRI hashes, versioned filenames, immutable cache headers.
- Privacy-respecting analytics only (e.g. self-hosted Plausible or Cloudflare Web Analytics): count tool usage and errors. Never send filenames, file contents, or page counts tied to identifiers.

## 5. Data model

None server-side. Client-side: `localStorage` for UI preferences only (wrapped in try/catch). Saved signatures stored in IndexedDB only if the user opts in, with a "forget my signature" button.

## 6. Security threat model

The main risks are (a) a malicious PDF exploiting the parser in the browser and (b) a compromised dependency or deploy exfiltrating user files. Both would destroy the product's core promise.

| Threat                                                       | Mitigation                                                                                                                                                                                                                                                                                                                                                                                                         |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Supply-chain compromise exfiltrates files**                | Strict CSP: `default-src 'self'; connect-src 'self' <analytics-host>; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self' blob:; object-src 'none'; frame-ancestors 'none'`. With `connect-src` locked down, even injected code can't send data elsewhere. Lockfile, pinned versions, Renovate with manual review, Socket.dev or similar on PRs, no install scripts (`pnpm` `onlyBuiltDependencies` allowlist) |
| Malicious PDF executes code via pdf.js                       | Keep pdf.js on latest; set `isEvalSupported: false`; disable scripting (`enableScripting: false`); render in a worker. (A 2024 pdf.js font-handling vulnerability allowed arbitrary JS; this is a real risk, not theory.)                                                                                                                                                                                          |
| PDF bombs (huge decompressed streams, deeply nested objects) | Per-op timeouts in workers (terminate worker on timeout), memory caps, page-count cap, clear error messages                                                                                                                                                                                                                                                                                                        |
| Deploy hijack (someone pushes malicious build)               | Deploy only from CI on protected `main`; required reviews; Cloudflare account with hardware-key 2FA; publish build hashes in the repo so users/researchers can verify                                                                                                                                                                                                                                              |
| XSS via filenames or PDF metadata shown in UI                | React text rendering only; never `dangerouslySetInnerHTML`                                                                                                                                                                                                                                                                                                                                                         |
| Password-protect tool weakness                               | AES-256 only (qpdf `--encrypt ... 256`); never offer RC4                                                                                                                                                                                                                                                                                                                                                           |
| Redaction (v2) leaving hidden text                           | Redaction must remove content streams and re-verify by extracting text from the output; test suite with known-sensitive fixtures                                                                                                                                                                                                                                                                                   |
| Signature misuse claims                                      | Clear UI copy: visual signature, not a certified e-signature                                                                                                                                                                                                                                                                                                                                                       |

**Verifiable privacy claim**: publish the CSP and a short "how to verify we never upload your files" page (open DevTools → Network). Make sure it's true by e2e test (below).

## 7. Scalability targets

- Server load is CDN static assets only: effectively unlimited users. Budget: initial JS ≤200 KB gzipped for the landing route; each tool's WASM lazily loaded.
- Performance targets on a mid-range laptop (e.g. 4-core, 8 GB):
  - Merge 10 × 5 MB PDFs: <3s
  - Compress a 50 MB scanned PDF (balanced): <20s
  - OCR: ≤3s per page
  - Thumbnail grid for 200 pages: first 20 thumbnails <1s, rest progressive
- On mobile, all tools functional; heavy tools (OCR, compress large) show an estimated time and warn.

## 8. Reliability

- No backend means no outages beyond the CDN. Service worker means the app works with no network.
- Graceful failure: any worker error returns a typed error to the UI with a human message ("This PDF is damaged. Try 'Repair' first."). Never a blank screen; React error boundary per tool.
- Feature detection with fallbacks (e.g. if OffscreenCanvas missing, fall back to main-thread canvas in chunks). Supported browsers: last 2 versions of Chrome, Edge, Firefox, Safari (desktop and iOS).
- Service worker update flow: new version prompts "Reload for update"; never silently swaps code mid-operation.

## 9. Tests

- Unit (Node, Vitest): every op in `packages/core` against a fixture corpus: simple PDF, scanned PDF, encrypted PDF, AcroForm, PDF with annotations, PDF 1.4 and 2.0, a very large page count, Unicode filenames, and known-malformed files (truncated, broken xref). Assert page counts, text presence, output validity (re-open with pdf.js and qpdf `--check`).
- Golden tests: rendered page images of outputs compared with a pixel-diff tolerance.
- Fuzzing: run a nightly job feeding mutated PDFs to each op (e.g. with a simple mutation fuzzer); any crash that isn't a typed error fails.
- E2E (Playwright on Chromium, Firefox, WebKit): each tool's happy path, plus **a network assertion: during processing, no request is made except to our own origin's static assets.** Fail the build if any request body exceeds 1 KB or goes to an unexpected host.
- E2E offline: load once, go offline, run merge, succeed.
- Accessibility: axe on every tool route; full keyboard flow for merge and reorder.

## 10. Cost model

- Static hosting on Cloudflare Pages: free tier covers large traffic. WASM and OCR data served from same origin with long cache.
- No per-user cost. This is the most "free forever" product in the set.

## 11. Licensing (check before building)

- pdf-lib (MIT), pdf.js (Apache-2.0), tesseract.js (Apache-2.0), qpdf (Apache-2.0), fflate (MIT): fine.
- The project is AGPL-3.0 (STANDARDS §9), so Ghostscript and MuPDF (both AGPL) are allowed. Evaluate MuPDF's WASM build for compression and rendering quality versus the pdf-lib + canvas approach in M1 and record the choice in an ADR. Keep their license files and list them in `THIRD_PARTY_NOTICES.md`.

## 12. Acceptance criteria

1. Every MVP tool produces a valid PDF that opens in Acrobat Reader, Chrome, and macOS Preview (manual check per release + automated qpdf `--check`).
2. Network inspection during any operation shows zero uploads (automated e2e).
3. App works fully offline after first visit.
4. A malformed PDF produces a friendly error, never a crash or frozen tab.
5. Lighthouse: Performance ≥90, Accessibility 100 on landing and each tool page.
6. CSP violations reported in e2e = 0.

## 13. Milestones

1. **M1 Foundation**: Vite app, worker protocol, CSP, CI, fixture corpus, deploy to Pages.
2. **M2 Page tools**: merge, split, reorder/rotate/delete, page numbers, watermark.
3. **M3 Convert**: images↔PDF, compress.
4. **M4 Forms & sign**: form fill/flatten, visual signature, password protect/remove.
5. **M5 OCR**.
6. **M6 Hardening & launch**: fuzzing job, offline PWA, network-assertion tests, privacy page, SEO landing pages.
