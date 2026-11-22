import { degrees, type PDFFont, type PDFPage, type RGB } from 'pdf-lib';
import { PdfToolsError } from './errors.ts';

/** The page as the reader sees it: visible (crop) box, with /Rotate applied. */
export interface VisualPage {
  width: number;
  height: number;
  rotation: 0 | 90 | 180 | 270;
}

export function visualPage(page: PDFPage): VisualPage {
  const box = page.getCropBox();
  const rotation = (((page.getRotation().angle % 360) + 360) % 360) as VisualPage['rotation'];
  const sideways = rotation === 90 || rotation === 270;
  return {
    width: sideways ? box.height : box.width,
    height: sideways ? box.width : box.height,
    rotation,
  };
}

/**
 * Map a point in visual space (origin bottom-left of the page as displayed) to user space,
 * plus the text angle that makes text upright on screen. /Rotate turns the page clockwise.
 */
export function toUserSpace(
  page: PDFPage,
  vx: number,
  vy: number,
): { x: number; y: number; angle: number } {
  const box = page.getCropBox();
  const { rotation } = visualPage(page);
  const W = box.width;
  const H = box.height;
  let x: number;
  let y: number;
  switch (rotation) {
    case 90:
      x = W - vy;
      y = vx;
      break;
    case 180:
      x = W - vx;
      y = H - vy;
      break;
    case 270:
      x = vy;
      y = H - vx;
      break;
    default:
      x = vx;
      y = vy;
  }
  return { x: box.x + x, y: box.y + y, angle: rotation };
}

export interface TextStamp {
  text: string;
  font: PDFFont;
  size: number;
  color: RGB;
  opacity?: number;
  /** Extra rotation in visual space, counter-clockwise degrees (e.g. 45 for a diagonal). */
  angle?: number;
}

/** Draw text centred on a visual point, upright for the reader regardless of /Rotate. */
export function drawCentred(page: PDFPage, vx: number, vy: number, s: TextStamp): void {
  const width = s.font.widthOfTextAtSize(s.text, s.size);
  const height = s.font.heightAtSize(s.size, { descender: false });
  const extra = ((s.angle ?? 0) * Math.PI) / 180;
  // Offset from the centre to the text origin (bottom-left of the baseline), rotated in visual space.
  const ox = -width / 2;
  const oy = -height / 2;
  const sx = vx + ox * Math.cos(extra) - oy * Math.sin(extra);
  const sy = vy + ox * Math.sin(extra) + oy * Math.cos(extra);
  const p = toUserSpace(page, sx, sy);
  page.drawText(s.text, {
    x: p.x,
    y: p.y,
    size: s.size,
    font: s.font,
    color: s.color,
    opacity: s.opacity ?? 1,
    rotate: degrees(p.angle + (s.angle ?? 0)),
  });
}

/** Standard 14 fonts only cover WinAnsi; refuse early with a clear message instead of crashing. */
export function assertEncodable(font: PDFFont, text: string, what: string): void {
  try {
    font.encodeText(text);
  } catch {
    throw new PdfToolsError(
      'invalid_input',
      `${what} can only use Latin characters for now (letters, digits and common punctuation).`,
    );
  }
}
