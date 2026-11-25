// Visual signature: stamp an image of a signature onto pages. This is not a cryptographic or
// certified e-signature, and the UI says so.
import { degrees } from 'pdf-lib';
import { PdfToolsError } from '../errors.ts';
import { sniffImage, validatePng } from '../images.ts';
import { baseName, PDF_MIME } from '../output.ts';
import { forFile, loadPdf, savePdf } from '../pdf.ts';
import type { OpContext, OpOutput } from '../protocol.ts';
import { toUserSpace, visualPage } from '../stamp.ts';

export interface SignaturePlacement {
  /** 0-based page index. */
  page: number;
  /** Top-left corner and width, as fractions (0..1) of the page as displayed. */
  x: number;
  y: number;
  width: number;
}

export interface SignArgs {
  file: { name: string; bytes: ArrayBuffer };
  /** PNG (with transparency) or JPEG of the signature. */
  image: ArrayBuffer;
  placements: SignaturePlacement[];
}

const fraction = (v: number) => Number.isFinite(v) && v >= 0 && v <= 1;

export async function sign(args: SignArgs, ctx: OpContext): Promise<OpOutput> {
  if (!Array.isArray(args.placements) || args.placements.length === 0) {
    throw new PdfToolsError('invalid_input', 'Place the signature on at least one page.');
  }
  const image = new Uint8Array(args.image);
  const format = sniffImage(image);
  if (format !== 'png' && format !== 'jpeg') {
    throw new PdfToolsError('invalid_input', 'The signature must be a PNG or JPG image.');
  }
  if (format === 'png') {
    try {
      validatePng(image);
    } catch {
      throw new PdfToolsError('invalid_input', 'The signature image is damaged.');
    }
  }
  return forFile(args.file.name, async () => {
    const doc = await loadPdf(args.file.bytes);
    const embedded = await (format === 'png' ? doc.embedPng(image) : doc.embedJpg(image)).catch(
      () => {
        throw new PdfToolsError('invalid_input', 'The signature image is damaged.');
      },
    );
    const pages = doc.getPages();
    for (const p of args.placements) {
      if (!Number.isInteger(p.page) || p.page < 0 || p.page >= pages.length) {
        throw new PdfToolsError(
          'invalid_input',
          'The signature is placed on a page that does not exist.',
        );
      }
      if (!fraction(p.x) || !fraction(p.y) || !fraction(p.width) || p.width === 0) {
        throw new PdfToolsError('invalid_input', 'The signature is placed outside the page.');
      }
      const page = pages[p.page]!;
      const { width: W, height: H } = visualPage(page);
      const w = p.width * W;
      const h = (w * embedded.height) / embedded.width;
      // Visual bottom-left of the box (y in the request is measured from the top).
      const origin = toUserSpace(page, p.x * W, H - p.y * H - h);
      page.drawImage(embedded, {
        x: origin.x,
        y: origin.y,
        width: w,
        height: h,
        rotate: degrees(origin.angle),
      });
    }
    ctx.progress(0.7);
    const bytes = await savePdf(doc);
    ctx.progress(1);
    return { files: [{ name: `${baseName(args.file.name)}-signed.pdf`, mime: PDF_MIME, bytes }] };
  });
}
