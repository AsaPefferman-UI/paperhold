# Product

<!-- impeccable:product-schema 1 -->

> Written headlessly by an autonomous build agent. Every fact below is inferred from `SPEC.md`
> and `STANDARDS.md` (no interview was possible). Items marked _(inferred)_ need owner confirmation.

## Platform

web

## Stack

delegated: Vite + React + TypeScript (strict), static build, Web Workers for all PDF work.
Chosen because SPEC.md §4 names it and there is no server.

## Users

Anyone who needs to merge, split, compress, sign, or convert a PDF without installing software,
paying, or uploading a sensitive document (tax forms, contracts, medical records) to a
stranger's server. Typical scene _(inferred)_: a person at a laptop or phone with one to a
dozen files in a downloads folder, wanting one result file in under a minute, often doing it
once and leaving.

## Product Purpose

A fast, private PDF toolkit that runs entirely on the user's device using WebAssembly. Files
never leave the browser. Success: the user gets a correct output file quickly, and can verify
for themselves that nothing was uploaded.

## Positioning

"We literally can't see your files." Competitors (Smallpdf, iLovePDF, Acrobat online) upload
files to their servers; this product cannot, because a strict Content Security Policy blocks
every outbound connection except its own static assets, and the privacy claim is checkable in
DevTools and enforced by an automated test.

## Operating Context

- One route per tool (`/merge`, `/split`, ...), reached from search or the home page.
- Works offline after first load (installable PWA).
- Inputs: PDFs and images from the local file system via drag and drop or a file picker.
- Outputs: downloaded files (Blob + object URL), sometimes a zip.
- Heavy work runs in Web Workers with progress and cancel for anything over a second.

## Capabilities and Constraints

- MVP tools: merge, split/extract, reorder/rotate/delete pages, compress, images to PDF,
  PDF to images, page numbers and text watermark, fill and flatten forms, visual signature,
  protect/unlock with password, OCR.
- Free forever, no accounts, no uploads, no third-party runtime hosts.
- Files over 200 MB warn; files over 1 GB are refused.
- The signature tool is a visual signature, not a certified e-signature, and must say so.
- Terminology: "PDF", "page", "file"; tools are named by their verb.

## Brand Commitments

Codename `pdf-tools` is a placeholder name. No logo, palette, or voice has been committed.
Open source under AGPL-3.0.

## Evidence on Hand

- The CSP and the e2e network assertion are real, verifiable proof of the privacy claim.
- No customer counts, testimonials, press, logos, or benchmarks exist. Never invent them.
- Performance targets in SPEC.md §7 are goals, not measured claims.

## Product Principles

1. Privacy is a mechanism, not a promise: show how to verify it.
2. The task comes first: drop files, get the result, leave.
3. Never freeze, never blank-screen: every failure gets a human sentence and a way forward.
4. Honest labels: say what a tool does and does not do (visual signature, limits).

## Accessibility & Inclusion

WCAG 2.2 AA, keyboard navigable (full keyboard flow for merge and reorder), visible focus,
works at 375 px width, axe clean on every route, Lighthouse Accessibility 100.
