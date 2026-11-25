# 0005: OCR with tesseract.js-core driven directly, integrity-checked self-hosted assets

- Status: accepted
- Date: 2026-11-24

## Context

SPEC.md suggests tesseract.js in a Web Worker with language packs loaded on demand and all WASM
and language data self-hosted. tesseract.js creates its worker from a blob URL that calls
`importScripts(corePath)`. Inside a blob worker that is governed by our
`script-src 'self' 'wasm-unsafe-eval'`, so loading verified bytes from blob URLs would require
adding `blob:` to `script-src`, weakening the CSP that underpins the product's privacy claim.

## Decision

Use `tesseract.js-core` (the WASM build tesseract.js itself loads) through its embind
`TessBaseAPI` from our own module worker. Vite bundles the small JS glue like any other code;
the 2.9 MB WASM binary and the language data are fetched from `/ocr-<version>/`, verified
against SHA-256 hashes compiled into the app, and passed to the engine as bytes
(`wasmBinary`, Emscripten FS). The CSP is unchanged.

Language data: `@tesseract.js-data/{eng,deu,fra,spa}` `4.0.0_best_int` models (MIT packaging,
Apache-2.0 models), the same models tesseract.js uses by default for its LSTM engine. Latin
scripts only for now, because the invisible text layer uses a standard WinAnsi font.

## Consequences

- About 150 lines of our own glue instead of tesseract.js's scheduler; one page at a time.
- Any tampered, truncated, or substituted OCR file is refused before use.
- Adding a language: add the `@tesseract.js-data/<code>` package and list it in
  `apps/web/build/ocr-assets.ts` and `OCR_LANGUAGES`.
