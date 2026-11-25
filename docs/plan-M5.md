# Plan: M5 OCR

## Scope

Make scanned PDFs searchable: recognise text on each page and add it as an invisible text
layer, leaving the page's appearance untouched. Runs entirely on the device; the engine and
language data are self-hosted, loaded on demand, and integrity-checked.

## Design (ADR 0005)

- Engine: `tesseract.js-core` 6.1.2 (Apache-2.0), the Emscripten build that tesseract.js wraps,
  driven directly through its `TessBaseAPI` (`Init`, `SetImageFile`, `Recognize`,
  `GetTSVText`). We do not use tesseract.js's own worker loader: it needs `importScripts` from
  blob URLs, which the CSP forbids.
- A dedicated module worker (`ocr.worker.ts`) is created per run and terminated on finish or
  cancel. The JS glue (SIMD or non-SIMD variant, feature-detected) is bundled by Vite; the WASM
  binary and `*_best_int` traineddata (eng, deu, fra, spa; MIT) are copied to `/ocr-<version>/`.
- Integrity: the build computes SHA-256 for every OCR file and compiles the manifest into the
  app (`__OCR_MANIFEST__`, also published as `manifest.json`). The worker fetches each file
  itself, checks the hash with WebCrypto, and only then hands the bytes to the engine.
  Language data is published with a `-gzip.bin` name so no server adds `Content-Encoding: gzip`
  (which would change the bytes the browser sees); the worker inflates it with fflate.
- Pages are rendered on the page with pdf.js at 200 DPI (capped at 16 MP), recognised in the OCR
  worker, and the text layer is written by the `addTextLayer` op in the ops worker: Helvetica,
  render mode 3 (invisible), one positioned run per word, horizontally scaled to the word box,
  correct on rotated pages.
- Progress: download, then pages with a time-left estimate after the first page, then saving.
  Cancel terminates the OCR worker.

## Acceptance criteria and their tests

| # | Criterion | Automated test |
| --- | --- | --- |
| 1 | TSV parsing keeps real words only | `core/test/ocr.test.ts` |
| 2 | Scanned fixture becomes searchable (pdf.js finds "quick brown fox", "4417"); output valid; rendering pixel-identical to the input | `core/test/ocr.test.ts` (real tesseract-core in Node) |
| 3 | Unencodable characters dropped, not fatal; mismatched results rejected; bad language codes rejected; unreadable images give typed errors | `core/test/ocr.test.ts` |
| 4 | In the browser: OCR runs, downloads come only from our origin, only the chosen languages load | `e2e/ocr.spec.ts` |
| 5 | A tampered download is refused with a clear message | `e2e/ocr.spec.ts` (one flipped byte) |
| 6 | Progress with time left, and cancel | `e2e/ocr.spec.ts` |
| 7 | CSP strict and unchanged, zero violations, zero uploads, axe clean on `/ocr` | guard fixture, `security.spec.ts`, `a11y.spec.ts` |

## Known limits

- Latin-script languages only (the text layer uses a WinAnsi font). CJK and Cyrillic need an
  embedded Unicode font: follow-up.
- Pages that already contain text are OCR'd too (their text gets a duplicate invisible layer).
- The 3 s per page target is met easily on the synthetic fixtures (about 0.1-0.2 s per page
  locally) but has not been measured on real 300 DPI scans.
