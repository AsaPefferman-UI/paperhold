# UI review log (impeccable audit + polish)

Each milestone that adds UI runs `impeccable detect`, a technical audit, and a polish pass. The
impeccable finish-reviewer and documenter sub-agents are not available in this headless build
environment, so their passes were run in-thread from the degraded checklists and are recorded
here. Visual direction is in `DESIGN.md`; the direction contract is in the (gitignored)
`.impeccable/surfaces/` brief.

## M1: Merge tool, home, 404

Detector: `impeccable detect --json` on all UI files: no findings.

| #   | Dimension                | Score  | Key finding                                                                                                                                                                                |
| --- | ------------------------ | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Accessibility            | 3 -> 4 | Global 0.01ms motion kill removed in favour of targeted reduced-motion rules. axe clean on all routes and states (automated). Keyboard reorder with live announcements.                    |
| 2   | Performance              | 4      | Landing route JS 70 KB gzipped (budget 200 KB). PDF libraries only in the worker chunk.                                                                                                    |
| 3   | Theming                  | 3 -> 4 | Dark band text failed contrast (light ink on mustard): added `--on-manila`.                                                                                                                |
| 4   | Responsive               | 3 -> 4 | Desktop left 40% of the width empty: steps now sit side by side at 64rem+, run step sticky. 375px verified. Drag reorder is mouse-only, with the buttons as the touch/keyboard equivalent. |
| 5   | Implementation integrity | 4      | Coherent token system; folder-tab nav and index-tab rows carry the world.                                                                                                                  |

Polish fixes applied: dark band contrast, two-column layout, reduced-motion behaviour,
screenshot script waits for transitions.

Open: light/dark screenshots should be re-checked once thumbnails land (M2).

## M2: Split, Organize, Page numbers, Watermark

Detector: no findings. Screens checked at 1280 (light and dark) and 375.

| # | Dimension | Score | Key finding |
| --- | --- | --- | --- |
| 1 | Accessibility | 4 | Every page action is a labelled button (move earlier/later, rotate, delete) with live announcements; axe clean on all new routes and on the populated grid. |
| 2 | Performance | 4 | pdf.js loads only on tools that show pages (lazy chunk); 1000-page file renders the first 20 thumbnails quickly and the rest progressively. |
| 3 | Theming | 4 | Thumbnail rotation via data attributes (no inline styles, CSP-safe); page white is a token. |
| 4 | Responsive | 3 -> 4 | Quarter-turned thumbnails overflowed their tile: thumbnails now sized to 82% of the square. Mobile showed one tile per row and three rows of tabs: two-column grid and a single scrollable tab row. |
| 5 | Implementation integrity | 4 | Index tabs reused for page numbers; same sheet/step structure across tools. |

Open: watermark and page-number tools have no live preview yet (follow-up).

## M3: Compress, Images to PDF, PDF to images

Detector: no findings. Screens checked at 1280 (light) and 375 (dark).

| # | Dimension | Score | Key finding |
| --- | --- | --- | --- |
| 1 | Accessibility | 4 | Presets are a native radio group with descriptions; savings announced as a status; axe clean on all routes (now derived from the tool registry so no tool can be missed). |
| 2 | Performance | 4 | qpdf.wasm and libheif.wasm load only inside the worker and only when needed; landing bundle unchanged. |
| 3 | Theming | 4 | New `.check` and `.saving` styles use tokens only. |
| 4 | Responsive | 3 -> 4 | With eight tools the tab strip wrapped onto a second row at 1280 px: tabs are now one row beside the wordmark that scrolls sideways, and the current tab is scrolled into view on phones. |
| 5 | Implementation integrity | 4 | A disabled-but-checked margin box was misleading when the page size follows the image: the option now only appears for fixed page sizes. |

## M4: Fill form, Sign, Protect, Unlock

Detector: no findings. Screens checked at 1280 (light) and 375 (dark).

| # | Dimension | Score | Key finding |
| --- | --- | --- | --- |
| 1 | Accessibility | 4 | Signature placement is a focusable slider (arrow keys move, +/- resize, value text announced); typed and uploaded signatures are keyboard alternatives to drawing; password mismatch is tied to its input with `aria-describedby`. axe clean. |
| 2 | Performance | 4 | Signature PNG encoded synchronously (Chromium deferred `toBlob` on detached canvases by seconds). |
| 3 | Theming | 4 | Segmented control, notice, placement area all tokenised. |
| 4 | Responsive | 3 -> 4 | Twelve tools overflowed the tab strip: tabs now use short labels and tighter padding; it still scrolls if needed, with the current tab kept in view. |
| 5 | Implementation integrity | 3 -> 4 | The signature caveat first rendered as a grid item and pushed the steps out of line: it is now a permanent note under the title via a `notice` slot on the tool page. |
