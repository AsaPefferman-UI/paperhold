# 0003: Compression engine: pdf-lib + canvas re-encode + qpdf, not MuPDF

- Status: accepted (revisit after M3 measurements)
- Date: 2026-11-22

## Context

SPEC.md §11 asks us to evaluate MuPDF's WASM build (AGPL, allowed because this project is
AGPL-3.0) against the pdf-lib + canvas approach for compression and rendering, in M1.

What was evaluated (npm `mupdf@1.28.6`, the official Artifex build, in Node 24):

|                                                                    | MuPDF WASM                                                                                                                                                                                                                                     | pdf-lib + canvas + qpdf                                                                                                                                      |
| ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Download size                                                      | `mupdf-wasm.wasm` 10.4 MB (3.6 MB brotli) + 100 KB JS                                                                                                                                                                                          | pdf-lib ~180 KB gz (already shipped for every tool), qpdf.wasm 1.3 MB (already needed for Protect/Unlock and `--check`)                                      |
| Lossy image downsampling / JPEG re-encode                          | Not exposed in the JS API typings (`saveToBuffer(options: any)` only). `compress-images` is lossless re-deflate. Unknown option strings abort the WASM module ("dropping unprocessed options", then a thrown abort), which is fragile to drive | Full control: decode each image XObject, scale on `OffscreenCanvas`, re-encode JPEG at the preset quality, keep the original when the new one is not smaller |
| Structural compression (garbage collection, object streams, flate) | Yes (`garbage=4,compress`)                                                                                                                                                                                                                     | qpdf `--object-streams=generate --compress-streams=y --recompress-flate --compression-level=9`                                                               |
| Rendering quality                                                  | Excellent                                                                                                                                                                                                                                      | pdf.js (already used for thumbnails and PDF to images) is good enough for previews and image export                                                          |
| License                                                            | AGPL-3.0 (compatible)                                                                                                                                                                                                                          | MIT / Apache-2.0 / ISC                                                                                                                                       |

## Decision

Use pdf-lib to walk image XObjects, the browser's canvas/`OffscreenCanvas` (WebCodecs where
available) to downscale and re-encode them per preset (high quality / balanced / smallest), and
qpdf-wasm for object-stream and flate recompression. No MuPDF for now.

Reasons: one-third of the download for the same user-visible feature, no new 10 MB dependency
on the critical path, every piece already ships for other tools, and the image step (where
almost all the savings are for scanned PDFs) is fully under our control.

## Consequences

- Compression quality depends on our image pipeline; M3 adds golden tests and size assertions
  on the scanned and image fixtures.
- Images in exotic colour spaces (CMYK, Indexed, ICC-based with 16-bit depth, JBIG2, JPX) are
  left as they are rather than risk a wrong colour conversion; qpdf still recompresses streams.
- If M3 measurements show the result is materially worse than desktop tools on real scans, a
  later ADR can add MuPDF as an optional, lazily loaded "maximum compression" engine; the AGPL
  license allows it, and `THIRD_PARTY_NOTICES.md` would list it.
