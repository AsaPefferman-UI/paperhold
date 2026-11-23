# 0004: HEIC/HEIF/AVIF decoding with libheif-js (LGPL-3.0), self-hosted WASM

- Status: accepted
- Date: 2026-11-23

## Context

SPEC.md asks for HEIC support in Images to PDF via a WASM decoder. Only Safari decodes HEIC
natively. Candidates on npm: `heic2any` (MIT, unmaintained since 2023, bundles an old libheif
build), `heic-decode` (ISC wrapper around libheif-js), `libheif-js` (LGPL-3.0, Emscripten build
of libheif 1.2x with libde265 for HEVC and dav1d for AV1, maintained).

## Decision

Use `libheif-js` directly, loading `libheif-wasm/libheif.js` (91 KB) lazily in the ops worker
and fetching `libheif.wasm` (1.46 MB, 490 KB gzipped) from our own origin as a Vite asset, only
when the user adds a HEIC/HEIF/AVIF file. It contains no `eval`; the CSP's `'wasm-unsafe-eval'`
is enough. Decoding is capped at 100 megapixels.

LGPL-3.0 is on the licence allowlist and compatible with AGPL-3.0. We ship the library
unmodified as a separate, replaceable WASM file and JS loader, and list it in
`THIRD_PARTY_NOTICES.md`.

## Consequences

- One more parser on the attack surface (libde265, dav1d). It runs in the ops worker under the
  same timeout/terminate rules and CSP as every other op.
- No HEVC sample can be generated (the build has no HEVC encoder), so the HEVC path needs a
  licence-clean sample from the owner to be covered by an automated test.
