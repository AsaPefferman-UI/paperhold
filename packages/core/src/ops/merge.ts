import { PDFDocument } from 'pdf-lib';
import { PdfToolsError } from '../errors.ts';
import { DEFAULT_LIMITS } from '../limits.ts';
import { forFile, loadPdf, savePdf } from '../pdf.ts';
import type { OpContext, OpOutput } from '../protocol.ts';

export interface MergeArgs {
  /** In output order. */
  files: { name: string; bytes: ArrayBuffer }[];
  outputName?: string;
}

export async function merge(args: MergeArgs, ctx: OpContext): Promise<OpOutput> {
  if (args.files.length < 2) {
    throw new PdfToolsError('invalid_input', 'Add at least two PDFs to merge.');
  }
  const out = await PDFDocument.create();
  let total = 0;
  for (const [i, file] of args.files.entries()) {
    await forFile(file.name, async () => {
      const src = await loadPdf(file.bytes, { maxPages: DEFAULT_LIMITS.maxPages - total });
      total += src.getPageCount();
      const pages = await out.copyPages(src, src.getPageIndices());
      for (const page of pages) out.addPage(page);
    });
    ctx.progress((i + 1) / (args.files.length + 1));
  }
  const bytes = await savePdf(out);
  ctx.progress(1);
  return { files: [{ name: args.outputName ?? 'merged.pdf', mime: 'application/pdf', bytes }] };
}
