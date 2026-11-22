# Design system: tool UI

Recorded from the built system (`apps/web/src/styles.css`). World: an open manila folder with
index-tab dividers. Mode: Operate. The landing and privacy pages (Persuade) are designed
separately with their own brief.

## Tokens

| Role                                      | Light                                   | Dark                  |
| ----------------------------------------- | --------------------------------------- | --------------------- |
| Band (folder edge, tabs strip) `--manila` | `#e3c46e`                               | `#b8912f`             |
| Ground `--manila-ground`                  | `#efdca6`                               | `#211d14`             |
| Band/edge line `--manila-edge`            | `#b8953f`                               | `#d0aa48`             |
| Text on band `--on-manila`                | `#1b2130`                               | `#17140c`             |
| Sheet (work area) `--paper`               | `#ffffff`                               | `#191c24`             |
| Sheet edge `--paper-edge`                 | `#d9cba3`                               | `#4a4430`             |
| Ink / soft ink                            | `#1b2130` / `#464d5e`                   | `#efe8d6` / `#c4bca8` |
| Primary action                            | `#2747c7`                               | `#9db1ff`             |
| Danger / OK                               | `#a8231b` / `#22693a`                   | `#ffb4a8` / `#9fd9ae` |
| Index tabs 0-3                            | `#c13a22` `#2a7d45` `#2f5fd0` `#6f42b8` | lighter variants      |

Type: system UI stack, body 16px/1.5, h1 clamp 28-40px, tabular numerals for sizes and counts.
Spacing scale 4/8/12/16/24/32/48px. One radius (6px). One shadow (soft, offset).

## Components

- **Band and folder tabs**: the header is the folder edge; each tool is a tab; the current tab
  takes the ground colour and joins the page below it.
- **Sheet**: white work area with hairline edge and soft shadow; one per step ("1. Add PDFs",
  "2. Merge"). On screens 64rem and wider the steps sit side by side and the run step is sticky.
- **Drop sheet**: a real file input styled as a dashed manila pocket; focus ring on the pocket.
- **File sheets with index tabs**: each file is a row with a coloured, numbered tab. Colour is
  stable per file (identity), the number is its position (order). Reorder by drag or by the
  up/down buttons (keyboard); removal is a button; changes are announced politely.
- **Stamps**: results and errors are stamped onto the sheet (outlined, tinted), never toasts.
- **Run step**: primary button, then a progress bar with Cancel, then the stamp and downloads.

## Rules

- Every colour through a token; dark mode redefines tokens only.
- No modals for tasks; the privacy note is always visible under the tool name.
- Colour fades carry state; movement is removed under `prefers-reduced-motion`.
- Touch targets 44px minimum for row actions and buttons.
