import { PDFDocument } from 'pdf-lib';
import { PdfToolsError } from '../errors.ts';
import { baseName, bundle, PDF_MIME } from '../output.ts';
import { forFile, loadPdf, savePdf } from '../pdf.ts';
import type { OpContext, OpOutput, OutputFile } from '../protocol.ts';
import { parsePageRanges, rangeIndices, rangeLabel, type PageRange } from '../ranges.ts';

export type SplitMode =
  /** One PDF containing the listed pages, in the listed order. */
  | { kind: 'extract'; ranges: string }
  /** One PDF per comma-separated range. */
  | { kind: 'ranges'; ranges: string }
  /** Consecutive chunks of N pages. */
  | { kind: 'every'; every: number };

export interface SplitArgs {
  file: { name: string; bytes: ArrayBuffer };
  mode: SplitMode;
}

function groupsFor(mode: SplitMode, count: number): PageRange[][] {
  switch (mode.kind) {
    case 'extract':
      return [parsePageRanges(mode.ranges, count)];
    case 'ranges':
      return parsePageRanges(mode.ranges, count).map((r) => [r]);
    case 'every': {
      const n = Math.floor(mode.every);
      if (!Number.isFinite(n) || n < 1) {
        throw new PdfToolsError('invalid_input', 'Choose a number of pages of 1 or more.');
      }
      const groups: PageRange[][] = [];
      for (let start = 0; start < count; start += n) {
        groups.push([{ start, end: Math.min(start + n, count) - 1 }]);
      }
      return groups;
    }
    default:
      throw new PdfToolsError('invalid_input');
  }
}

export async function split(args: SplitArgs, ctx: OpContext): Promise<OpOutput> {
  const base = baseName(args.file.name);
  return forFile(args.file.name, async () => {
    const src = await loadPdf(args.file.bytes);
    const groups = groupsFor(args.mode, src.getPageCount());
    const files: OutputFile[] = [];
    for (const [i, group] of groups.entries()) {
      const out = await PDFDocument.create();
      const pages = await out.copyPages(src, rangeIndices(group));
      for (const p of pages) out.addPage(p);
      const label = group.map(rangeLabel).join(',');
      files.push({ name: `${base}-pages-${label}.pdf`, mime: PDF_MIME, bytes: await savePdf(out) });
      ctx.progress((i + 1) / (groups.length + 1));
    }
    const result = bundle(files, `${base}-split.zip`);
    ctx.progress(1);
    return { files: result };
  });
}
