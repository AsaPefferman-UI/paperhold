# Plan: M2 Page tools

## Scope

Split / extract, organize (reorder, rotate, delete with a thumbnail grid), page numbers, text
watermark. Merge shipped in M1. pdf.js thumbnails (self-hosted data files) arrive here.

## Acceptance criteria and their tests

| # | Criterion | Automated test |
| --- | --- | --- |
| 1 | Page ranges like `1-3, 5, 8-` parse; bad input explains itself | `core/test/page-tools.test.ts` (parsePageRanges) |
| 2 | Split: extract (one file), one file per range, every N pages; multi-output is a zip | `page-tools.test.ts` (split, bundle); `e2e/page-tools.spec.ts` |
| 3 | Organize: reorder, rotate (adds to existing /Rotate), delete, duplicate; invalid orders rejected | `page-tools.test.ts` (organize); e2e keyboard flow |
| 4 | Page numbers: positions, templates, page subset, upright on rotated pages | unit + golden images `page-numbers-*.png` |
| 5 | Watermark: diagonal, opacity, colours; non-Latin text gives a clear error | unit + golden `watermark-diagonal-red.png`; e2e |
| 6 | Thumbnails: first 20 quickly, rest progressive, 1000-page file stays responsive | e2e `organize: thumbnails for 1000 pages` |
| 7 | Damaged file in a thumbnail tool shows a friendly error | e2e `organize: a damaged PDF` |
| 8 | Every new route: CSP header, zero CSP violations, zero uploads, axe clean | `security.spec.ts`, guard fixture, `a11y.spec.ts` |
| 9 | Outputs valid per qpdf `--check` and pdf.js | `expectValidPdf` in unit tests |

## Notes

- Watermark and page numbers use the standard Helvetica fonts (WinAnsi). Non-Latin text is
  refused with a clear message; embedding a Unicode font is a follow-up.
- Golden images are rendered in Node with pdf.js + @napi-rs/canvas; `UPDATE_GOLDEN=1` rewrites.
