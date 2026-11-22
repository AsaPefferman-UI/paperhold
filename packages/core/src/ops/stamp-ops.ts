import { rgb, StandardFonts } from 'pdf-lib';
import { PdfToolsError } from '../errors.ts';
import { baseName, PDF_MIME } from '../output.ts';
import { forFile, loadPdf, savePdf } from '../pdf.ts';
import type { OpContext, OpOutput } from '../protocol.ts';
import { parsePageRanges, rangeIndices } from '../ranges.ts';
import { assertEncodable, drawCentred, visualPage } from '../stamp.ts';

type FileArg = { name: string; bytes: ArrayBuffer };

export type NumberPosition =
  'bottom-center' | 'bottom-right' | 'bottom-left' | 'top-center' | 'top-right' | 'top-left';

export interface PageNumbersArgs {
  file: FileArg;
  position: NumberPosition;
  /** "{n}", "{n} of {total}", "Page {n}", "Page {n} of {total}" or any template with those tokens. */
  format: string;
  startAt: number;
  fontSize: number;
  /** Which pages get a number, e.g. "2-" to skip a cover. Empty = all. */
  pages?: string;
}

export interface WatermarkArgs {
  file: FileArg;
  text: string;
  fontSize: number;
  /** 0..1 */
  opacity: number;
  /** Counter-clockwise degrees in the reader's view. */
  angle: number;
  color: 'gray' | 'red' | 'blue';
  pages?: string;
}

const COLORS = { gray: rgb(0.45, 0.45, 0.45), red: rgb(0.75, 0.1, 0.1), blue: rgb(0.1, 0.2, 0.7) };

function targetPages(spec: string | undefined, count: number): number[] {
  return spec?.trim()
    ? [...new Set(rangeIndices(parsePageRanges(spec, count)))]
    : [...Array(count).keys()];
}

function checkNumber(value: number, min: number, max: number, label: string): void {
  if (!Number.isFinite(value) || value < min || value > max) {
    throw new PdfToolsError('invalid_input', `${label} must be between ${min} and ${max}.`);
  }
}

export async function pageNumbers(args: PageNumbersArgs, ctx: OpContext): Promise<OpOutput> {
  checkNumber(args.fontSize, 6, 72, 'Font size');
  checkNumber(args.startAt, 0, 100_000, 'The first number');
  if (!args.format.includes('{n}')) {
    throw new PdfToolsError('invalid_input', 'The format needs {n} where the number goes.');
  }
  return forFile(args.file.name, async () => {
    const doc = await loadPdf(args.file.bytes);
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const pages = doc.getPages();
    const targets = targetPages(args.pages, pages.length);
    const total = targets.length;
    const margin = Math.max(18, args.fontSize * 1.6);
    for (const [i, index] of targets.entries()) {
      const page = pages[index]!;
      const text = args.format
        .replaceAll('{n}', String(args.startAt + i))
        .replaceAll('{total}', String(args.startAt + total - 1));
      assertEncodable(font, text, 'Page number text');
      const { width, height } = visualPage(page);
      const [vert, horiz] = args.position.split('-') as [
        'top' | 'bottom',
        'left' | 'center' | 'right',
      ];
      const half = font.widthOfTextAtSize(text, args.fontSize) / 2;
      const vx =
        horiz === 'left' ? margin + half : horiz === 'right' ? width - margin - half : width / 2;
      const vy = vert === 'top' ? height - margin : margin;
      drawCentred(page, vx, vy, { text, font, size: args.fontSize, color: rgb(0.1, 0.1, 0.1) });
      if (i % 20 === 0) ctx.progress((i + 1) / (total + 1));
    }
    const bytes = await savePdf(doc);
    ctx.progress(1);
    return { files: [{ name: `${baseName(args.file.name)}-numbered.pdf`, mime: PDF_MIME, bytes }] };
  });
}

export async function watermark(args: WatermarkArgs, ctx: OpContext): Promise<OpOutput> {
  const text = args.text.trim();
  if (!text) throw new PdfToolsError('invalid_input', 'Enter the watermark text.');
  if (text.length > 200)
    throw new PdfToolsError('invalid_input', 'Keep the watermark under 200 characters.');
  checkNumber(args.fontSize, 6, 300, 'Font size');
  checkNumber(args.opacity, 0.05, 1, 'Opacity');
  checkNumber(args.angle, -180, 180, 'Angle');
  const color = COLORS[args.color];
  if (!color) throw new PdfToolsError('invalid_input', 'Choose a watermark colour.');
  return forFile(args.file.name, async () => {
    const doc = await loadPdf(args.file.bytes);
    const font = await doc.embedFont(StandardFonts.HelveticaBold);
    assertEncodable(font, text, 'Watermark text');
    const pages = doc.getPages();
    const targets = targetPages(args.pages, pages.length);
    for (const [i, index] of targets.entries()) {
      const page = pages[index]!;
      const { width, height } = visualPage(page);
      drawCentred(page, width / 2, height / 2, {
        text,
        font,
        size: args.fontSize,
        color,
        opacity: args.opacity,
        angle: args.angle,
      });
      if (i % 20 === 0) ctx.progress((i + 1) / (targets.length + 1));
    }
    const bytes = await savePdf(doc);
    ctx.progress(1);
    return {
      files: [{ name: `${baseName(args.file.name)}-watermarked.pdf`, mime: PDF_MIME, bytes }],
    };
  });
}
