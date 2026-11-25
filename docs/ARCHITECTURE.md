# Architecture and maintainer guide

How Paperhold is put together, and how to change it without breaking the privacy promise. Read
this before your first non-trivial change. Decisions and their reasons live in [adr/](adr/).

## The one rule

Files never leave the device. Everything below serves that: there is no server code, every
library and data file is self-hosted, and the e2e suite fails the build if any request leaves
the origin, uses a method other than GET/HEAD, carries a body over 1 KB, or triggers a CSP
violation (`apps/web/e2e/fixtures.ts`).

## Shape of the system

Paperhold is a static site. "Scaling" means a CDN serving files; every user's processing runs on
their own machine, so server cost does not grow with use. What has to scale is the work inside
one browser tab, and that is bounded by explicit limits (below).

```
browser tab
├─ page (React, apps/web/src)          UI only. Imports @pdf-tools/core for types, errors, limits.
│    useOperation ──► WorkerPool ──────┐
│                                      ▼  postMessage (ArrayBuffers transferred, zero-copy)
├─ ops workers (ops.worker.ts) × 1-4   runOp() from @pdf-tools/core/run → pdf-lib, qpdf.wasm,
│                                      libheif, OffscreenCanvas
├─ OCR worker (ocr.worker.ts)          tesseract.js-core WASM, downloads verified by SHA-256
├─ pdf.js worker                       thumbnails and page rendering
└─ service worker (sw.js)              offline cache, versioned per build
```

### Packages

| Path | What it is | May import |
| --- | --- | --- |
| `packages/core` | Pure PDF operations, typed worker protocol, errors, limits. No DOM, no React. Unit-tested in Node against the fixture corpus. | pdf-lib, fflate |
| `packages/core` entry `@pdf-tools/core` | UI-safe exports only (types, errors, limits, ranges). | |
| `packages/core` entry `@pdf-tools/core/run` | `runOp()` and every op. Imported **only** by workers, so PDF libraries never land in the page bundle. | |
| `apps/web/src` | The React app: tool pages, components, worker pool, service worker client. | `@pdf-tools/core` (page), `@pdf-tools/core/run` (workers only) |
| `apps/web/build` | Vite plugin that emits per-route HTML, `_headers`, sitemap, manifest, `sw.js`, and copies versioned engine data. | |
| `apps/web/security-headers.ts` | The single source of truth for CSP and security headers (preview server, Cloudflare `_headers`, nginx config). | |
| `apps/web/site.config.ts` | Name, URL, repo, contacts, analytics. The only file a fork edits to rebrand. | |

The internal package scope is `@pdf-tools/*` (the project's original codename). It is not
user-visible; renaming it would touch every import and the lockfile for no benefit.

### Request flow for one operation

1. A tool page (`apps/web/src/tools/<Tool>.tsx`) collects inputs and calls
   `run()` from `useOperation('<opName>')`, returning `{ args, transfer }`.
2. `useOperation` (`src/lib/useOperation.ts`) owns the lifecycle: progress, cancel, typed
   errors, result object URLs (revoked on reset), and the "busy" flag that blocks service worker
   updates mid-task.
3. `WorkerPool` (`src/worker/pool.ts`) queues the job on one of up to 4 workers
   (`hardwareConcurrency - 1`), transferring buffers. A timeout or cancel **terminates** the
   worker (the only way to stop a runaway parser); a fresh one takes the slot next time.
4. `ops.worker.ts` calls `runOp(op, args, ctx)` with browser services (OffscreenCanvas codecs,
   libheif, qpdf.wasm). If the browser has no OffscreenCanvas in workers, canvas calls are sent
   back to the page (`CanvasCall`) and answered there.
5. The op returns `{ files, data? }`; output buffers are transferred back and offered as
   downloads.

Errors are `PdfToolsError` with a code (`invalid_input`, `too_large`, `damaged`, `cancelled`,
...) and a human message. Never show a raw exception to users.

### Limits (what bounds work in one tab)

`packages/core/src/limits.ts`: warn above 200 MB, refuse above 1 GB, at most 10,000 pages per
operation, 5-minute timeout per job. Pixel caps for rendering live in `ops/pdf-to-images.ts`
(`MAX_PIXELS`). Change limits there, not in tool code, and keep the fuzz and corpus tests green.

## How to add a tool

Touch these places, in order. CI catches most omissions, but not all.

1. **Core op**: `packages/core/src/ops/<name>.ts` exporting `async function <name>(args, ctx)`
   and its `<Name>Args` type. Report progress with `ctx.progress()`; throw `PdfToolsError`.
2. **Protocol**: add `<name>: <Name>Args` to `OpArgs` in `packages/core/src/protocol.ts`.
3. **Registry**: add it to `registry` in `packages/core/src/dispatch.ts` (TypeScript fails until
   2 and 3 agree).
4. **Unit tests**: `packages/core/test/*.test.ts` against `fixtures/corpus`. Add a fixture to
   `fixtures/generate.ts` if needed (`pnpm fixtures`). Add the op to the fuzzer
   (`packages/core/fuzz/fuzz.ts`) if it parses PDFs.
5. **Metadata**: add an entry to `TOOLS` in `apps/web/src/tools.ts` (path, name, short tab label,
   one-sentence description, accepted types). Titles, meta tags, sitemap, the landing page list
   and OG images all read from here.
6. **Route**: add the lazy import and route in `apps/web/src/routes.tsx`. `routes.test.ts` fails
   if `TOOLS` and `ROUTES` disagree.
7. **Page**: `apps/web/src/tools/<Tool>.tsx`, built from `ToolPage`, `SingleFile`/`FileDrop`,
   `RunPanel` and `useOperation`. Follow an existing tool of the same shape (`Unlock.tsx` is the
   smallest). Styles only this tool uses go in `<Tool>.css` beside it,
   wrapped in `@layer components` and imported by the tool (see Styles below).
8. **E2E**: a spec in `apps/web/e2e/` covering the happy path and the main error path. The
   network guard applies automatically; the axe scan covers the new route automatically.
9. **Images**: `pnpm build && pnpm preview`, then `pnpm images` to generate its OG image.
10. **CHANGELOG** under "Unreleased", and `THIRD_PARTY_NOTICES.md` if you added a dependency
    (write an ADR first for anything heavy).

## Self-hosted engines and how to upgrade them

| Engine | Package | Served from | Integrity |
| --- | --- | --- | --- |
| pdf.js (fonts, CMaps, decoders) | `pdfjs-dist` | `/pdfjs-<version>/` | versioned path, immutable cache |
| OCR | `tesseract.js-core` + `@tesseract.js-data/*` | `/ocr-<version>/` | SHA-256 per file compiled into the app (`apps/web/build/ocr-assets.ts`); the worker refuses mismatches |
| qpdf | `@neslinesli93/qpdf-wasm` | hashed Vite asset | content-hashed filename |
| HEIC | `libheif-js` | hashed Vite asset | content-hashed filename |

To upgrade: bump the exact version in `package.json`, `pnpm install`, `pnpm build`. Paths,
hashes and the service worker's version string are recomputed by the build; nothing is edited by
hand. Then run the full unit, fuzz and e2e suites. Renovate groups pdf.js separately because it
parses untrusted input: read its release notes for security fixes before merging.

## Offline and updates

`apps/web/build/sw-template.js` becomes `dist/sw.js` with a version derived from a hash of the
build output. It precaches the app shell and every route, and caches the versioned engine folders
on first use. A new version waits; the page shows "Reload for update", disabled while any task is
running (`src/lib/busy.ts`), so code is never swapped mid-operation.

## Testing layers

| Layer | Command | What it protects |
| --- | --- | --- |
| Typecheck, lint, format | `pnpm typecheck`, `pnpm lint` | strict TS, ESLint strict with zero warnings, Prettier |
| Unit | `pnpm test` | ops against the corpus, golden images (pdf.js + @napi-rs/canvas in Node), real OCR, pool, config |
| Fuzz | `pnpm fuzz` (CI short pass; nightly long pass) | parser hangs and crashes; each case runs in a killable worker thread |
| E2E | `pnpm build && pnpm test:e2e` | every tool in Chromium, Firefox and WebKit under the network and CSP guards; axe (Chromium and WebKit) |
| Lighthouse | `pnpm lighthouse` against `pnpm preview` | performance ≥ 90, accessibility 100 on every page |
| Security | CI | gitleaks (full history), `pnpm audit`, licence allowlist, CodeQL, Trivy on the image |

Flaky tests are quarantined and tracked in [STATUS.md](STATUS.md), never retried until green
(`retries: 0`).

## Releases

A signed `v*` tag on `main` runs the Release workflow: one build, published SHA256SUMS and
provenance, deploy of that exact artifact to Cloudflare Pages through protected environments.
Details: [runbooks/deploy.md](runbooks/deploy.md).

## Styles

Plain CSS, organised by job and ordered with cascade layers. `src/styles/index.css` declares the
order once, before anything else loads: `@layer tokens, base, components, utilities;`. Every
CSS file wraps its rules in one of these layers, so the cascade never depends on which file or
lazy-loaded tool chunk arrives first. Unlayered CSS would beat every layer: don't write any.

| File | Layer | Holds |
| --- | --- | --- |
| `src/styles/tokens.css` | tokens | Colours, spacing, radius, fonts, motion. Light theme plus a dark block. Hover shades are derived with `color-mix()` and never overridden per theme |
| `src/styles/base.css` | base | Reset, typography, links, focus ring, `.visually-hidden` |
| `src/styles/components.css` | components | Styles shared by many tools or by always-loaded pages (sheet, buttons, tabs, stamps, form fields, choices) |
| `<Component>.css` beside its `.tsx` | components | Styles one component owns (Layout, ToolPage, FileDrop, FileList, RunPanel, PageGrid, SignatureMaker, UpdateBanner, and single-tool files under `src/tools/`). Imported by that component, so Vite ships them in its lazy chunk |
| `src/styles/utilities.css` | utilities | Layout helpers `.stack` (vertical grid) and `.cluster` (wrapping row). Spacing via `--gap` on the component |
| `src/landing.css` | components | Landing and privacy pages (designed separately, Hallmark stamp at the top) |

Rules of thumb:

- No literal colours outside `tokens.css`. Need a tint or hover shade? Try
  `color-mix(in oklab, var(--x) 10%, var(--paper))` in place or as a derived token, and check it in
  both themes. Use `oklab`, not `oklch`: oklch interpolates hue (dark-mode blue + cream became
  pink). When a derived colour looks wrong in one theme, as the dark status tints did, keep a
  hand-picked token per theme instead.
- Use native nesting for a component's states and children (`&:hover`, `& input`, nested
  `@media`), including its `prefers-reduced-motion` override.
- An element with `.stack` or `.cluster` takes its spacing from `--gap`. Setting `gap` in a
  component rule has no effect there, because utilities win.
- A rule that must beat another component's rule with the same specificity raises its own
  specificity (`.field.inline-field`), rather than relying on file load order.

## Known maintenance hotspots
- Adding a tool touches 6+ files (above). If tools keep growing, a single registry that also
  holds the lazy component would remove step 6.
- Firefox axe scans are quarantined in CI (see [STATUS.md](STATUS.md), Known gaps).
