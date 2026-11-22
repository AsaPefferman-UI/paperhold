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
