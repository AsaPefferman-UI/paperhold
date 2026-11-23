import { degrees, PDFDocument, type PDFImage } from 'pdf-lib';
import { PdfToolsError } from '../errors.ts';
import { jpegOrientation, orientationDegrees, sniffImage } from '../images.ts';
import { PDF_MIME } from '../output.ts';
import type { OpContext, OpOutput } from '../protocol.ts';

export type PageSizeChoice = 'fit' | 'a4' | 'letter';

export interface ImagesToPdfArgs {
  /** In page order. `mime` is only a hint for the decoder; the format is sniffed from bytes. */
  files: { name: string; bytes: ArrayBuffer; mime: string }[];
  pageSize: PageSizeChoice;
  /** Margin in points for fixed page sizes. */
  margin: number;
  outputName?: string;
}

const SIZES = { a4: [595.28, 841.89], letter: [612, 792] } as const;
/** "Fit" pages show the image at 96 DPI, capped at 200 inches (the PDF page size limit). */
const FIT_SCALE = 72 / 96;
const MAX_PAGE_PT = 14_400;

export async function imagesToPdf(args: ImagesToPdfArgs, ctx: OpContext): Promise<OpOutput> {
  if (!Array.isArray(args.files) || args.files.length === 0) {
    throw new PdfToolsError('invalid_input', 'Add at least one image.');
  }
  if (!['fit', 'a4', 'letter'].includes(args.pageSize)) throw new PdfToolsError('invalid_input');
  const margin = Math.min(Math.max(0, Number(args.margin) || 0), 144);
  const doc = await PDFDocument.create();
  for (const [i, file] of args.files.entries()) {
    let bytes: Uint8Array = new Uint8Array(file.bytes);
    let format = sniffImage(bytes);
    let turn: 0 | 90 | 180 | 270 = 0;
    if (format === 'jpeg') turn = orientationDegrees(jpegOrientation(bytes));
    if (format !== 'jpeg' && format !== 'png') {
      if (format === 'unknown') {
        throw new PdfToolsError('unsupported', `${file.name}: this is not an image we can read.`);
      }
      if (!ctx.services?.decodeImage) {
        throw new PdfToolsError(
          'unsupported',
          `${file.name}: ${format.toUpperCase()} images are not supported here.`,
        );
      }
      try {
        const decoded = await ctx.services.decodeImage(bytes, file.mime);
        bytes = decoded.bytes;
        format = decoded.format;
      } catch (err) {
        if (err instanceof PdfToolsError)
          throw new PdfToolsError(err.code, `${file.name}: ${err.message}`);
        throw new PdfToolsError(
          'damaged',
          `${file.name}: this image is damaged or could not be decoded.`,
        );
      }
    }
    let image: PDFImage;
    try {
      image = format === 'jpeg' ? await doc.embedJpg(bytes) : await doc.embedPng(bytes);
    } catch {
      throw new PdfToolsError(
        'damaged',
        `${file.name}: this image is damaged or could not be decoded.`,
      );
    }
    // Size as displayed (after EXIF rotation).
    const sideways = turn === 90 || turn === 270;
    const iw = sideways ? image.height : image.width;
    const ih = sideways ? image.width : image.height;
    let pw: number;
    let ph: number;
    if (args.pageSize === 'fit') {
      const s = Math.min(FIT_SCALE, MAX_PAGE_PT / Math.max(iw, ih));
      pw = iw * s;
      ph = ih * s;
    } else {
      const [w, h] = SIZES[args.pageSize];
      [pw, ph] = iw > ih ? [h, w] : [w, h]; // landscape page for landscape images
    }
    const m = args.pageSize === 'fit' ? 0 : margin;
    const s = Math.min((pw - 2 * m) / iw, (ph - 2 * m) / ih);
    const dw = iw * s;
    const dh = ih * s;
    const x = (pw - dw) / 2;
    const y = (ph - dh) / 2;
    const page = doc.addPage([pw, ph]);
    // drawImage rotates counter-clockwise about its origin; place the origin so the result lands in the box.
    const w = sideways ? dh : dw;
    const h = sideways ? dw : dh;
    const origin =
      turn === 90
        ? { x, y: y + dh }
        : turn === 180
          ? { x: x + dw, y: y + dh }
          : turn === 270
            ? { x: x + dw, y }
            : { x, y };
    page.drawImage(image, { ...origin, width: w, height: h, rotate: degrees(-turn) });
    ctx.progress((i + 1) / (args.files.length + 1));
  }
  doc.setProducer('pdf-tools');
  doc.setCreator('pdf-tools');
  const bytes = await doc.save({ useObjectStreams: true });
  ctx.progress(1);
  return { files: [{ name: args.outputName ?? 'images.pdf', mime: PDF_MIME, bytes }] };
}
