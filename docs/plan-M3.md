# Plan: M3 Convert

## Scope

Images to PDF (JPG, PNG, HEIC/HEIF/AVIF via a WASM decoder, and WebP/GIF/BMP via the browser),
PDF to images (PNG or JPG per page, zip for several), and Compress (three presets), following
ADR 0003 (pdf-lib + canvas re-encode + qpdf; no MuPDF).

## Design

- Core ops stay pure and Node-testable. Pixel work is injected through `OpContext.services`
  (`decodeImage`, `encodeJpeg`, `qpdf`): the worker supplies OffscreenCanvas, libheif-js and
  qpdf.wasm; tests supply @napi-rs/canvas and the Node qpdf build.
- Browsers without OffscreenCanvas in workers (SPEC §8) hand canvas calls back to the page over
  the worker protocol (`canvas` / `canvasResult` messages). Pixels only move between our own
  threads. Verified by Playwright WebKit on Windows, which lacks OffscreenCanvas.
- PDF to images renders with pdf.js on the page (it needs a DOM canvas); core owns page
  selection, DPI, the 16-megapixel per-page cap, naming and zipping, with progress and cancel.
- Compress re-encodes 8-bit RGB/Gray (and ICC N=1/3) images that are JPEG or Flate (with or
  without PNG predictors) when the result is smaller, then runs qpdf with object streams and
  maximum Flate. The original is returned whenever nothing gets smaller.

## Acceptance criteria and their tests

| # | Criterion | Automated test |
| --- | --- | --- |
| 1 | Images sniffed by magic bytes; EXIF orientation applied; PNG predictors undone | `core/test/convert.test.ts` (image helpers) |
| 2 | Images to PDF: one page per image, fit / A4 / Letter, landscape pages for landscape images, rotated phone photos upright | unit + golden `images-exif-rotated-a4.png`; e2e |
| 3 | Non-JPEG/PNG formats decoded by the platform (GIF, BMP in e2e; HEIC decoder loads and rejects bad data with a typed error) | unit (`imagesToPdf` decoder path), `apps/web/src/worker/heic.test.ts`, e2e |
| 4 | PDF to images: chosen pages, PNG or JPG, zip for several, single image directly, huge renders capped, cancel honoured | unit (`pdfToImages` with pdf.js + napi renderer); e2e |
| 5 | Compress: image-heavy PDF shrinks by more than 70% on Balanced, stays valid (qpdf `--check`, pdf.js), text kept; presets ordered by size; never larger than input | unit + golden `compress-images-balanced.png`; e2e |
| 6 | Encrypted / damaged inputs give friendly errors | unit + e2e |
| 7 | Canvas fallback for workers without OffscreenCanvas | `pool.test.ts` (canvas fallback) + WebKit e2e |
| 8 | Every new route: CSP, zero violations, zero uploads, axe | `security.spec.ts`, guard fixture, `a11y.spec.ts` (routes now derived from the tool registry) |

## Known limits

- No HEVC-coded HEIC sample in the corpus: no licence-clean sample is available and the WASM
  build has no HEVC encoder to make one. The decoder is wired and unit-tested for loading and
  error handling; real iPhone photos need a manual check (open question in STATUS).
- Compress leaves CMYK, Indexed, 16-bit, JBIG2 and JPX images untouched (ADR 0003).
- The 50 MB scanned-PDF timing target (< 20 s) is not yet measured automatically.
