import { degrees, PDFDocument } from 'pdf-lib';
import { PdfToolsError } from '../errors.ts';
import { baseName, PDF_MIME } from '../output.ts';
import { forFile, loadPdf, savePdf } from '../pdf.ts';
import type { OpContext, OpOutput } from '../protocol.ts';

export type QuarterTurn = 0 | 90 | 180 | 270;

export interface OrganizeArgs {
  file: { name: string; bytes: ArrayBuffer };
  /** Output pages in order. Pages left out are deleted; a page may appear more than once. */
  pages: { index: number; rotate: QuarterTurn }[];
}

const normalise = (deg: number) => (((Math.round(deg / 90) * 90) % 360) + 360) % 360;

/** Reorder, rotate, and delete pages in one pass. */
export async function organize(args: OrganizeArgs, ctx: OpContext): Promise<OpOutput> {
  if (!Array.isArray(args.pages) || args.pages.length === 0) {
    throw new PdfToolsError('invalid_input', 'Keep at least one page.');
  }
  return forFile(args.file.name, async () => {
    const src = await loadPdf(args.file.bytes);
    const count = src.getPageCount();
    for (const p of args.pages) {
      if (!Number.isInteger(p.index) || p.index < 0 || p.index >= count) {
        throw new PdfToolsError('invalid_input', 'A page in the new order does not exist.');
      }
      if (![0, 90, 180, 270].includes(p.rotate)) {
        throw new PdfToolsError('invalid_input', 'Pages can only turn in quarter turns.');
      }
    }
    const out = await PDFDocument.create();
    const copied = await out.copyPages(
      src,
      args.pages.map((p) => p.index),
    );
    for (const [i, page] of copied.entries()) {
      const turn = args.pages[i]!.rotate;
      if (turn) page.setRotation(degrees(normalise(page.getRotation().angle + turn)));
      out.addPage(page);
    }
    ctx.progress(0.8);
    const bytes = await savePdf(out);
    ctx.progress(1);
    return {
      files: [{ name: `${baseName(args.file.name)}-organized.pdf`, mime: PDF_MIME, bytes }],
    };
  });
}
