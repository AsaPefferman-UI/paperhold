// PDF -> images. Rendering needs a canvas, so the caller supplies a renderer (pdf.js on the
// page in the browser, pdf.js + @napi-rs/canvas in tests); this module owns page selection,
// sizing limits, naming, and packaging.
import { PdfToolsError } from '../errors.ts';
import { baseName, bundle } from '../output.ts';
import type { OpContext, OpOutput } from '../protocol.ts';
import { parsePageRanges, rangeIndices } from '../ranges.ts';

export type ImageType = 'png' | 'jpeg';

export interface PageRenderer {
  pageCount: number;
  /** Size of a 0-based page at 72 DPI, as displayed. */
  pageSize(index: number): Promise<{ width: number; height: number }>;
  render(index: number, scale: number, type: ImageType, quality: number): Promise<Uint8Array>;
}

export interface PdfToImagesArgs {
  name: string;
  type: ImageType;
  dpi: number;
  /** Empty = all pages. */
  pages?: string;
}

/** Browsers cap canvas area (~16-268 megapixels); stay well inside the smallest common cap. */
export const MAX_PIXELS = 16_000_000;

export async function pdfToImages(
  args: PdfToImagesArgs,
  renderer: PageRenderer,
  ctx: OpContext & { signal?: AbortSignal },
): Promise<OpOutput> {
  if (!['png', 'jpeg'].includes(args.type)) throw new PdfToolsError('invalid_input');
  if (!Number.isFinite(args.dpi) || args.dpi < 36 || args.dpi > 600) {
    throw new PdfToolsError('invalid_input', 'Resolution must be between 36 and 600 DPI.');
  }
  const indices = args.pages?.trim()
    ? [...new Set(rangeIndices(parsePageRanges(args.pages, renderer.pageCount)))]
    : [...Array(renderer.pageCount).keys()];
  const base = baseName(args.name);
  const ext = args.type === 'png' ? 'png' : 'jpg';
  const digits = String(renderer.pageCount).length;
  const files = [];
  for (const [i, index] of indices.entries()) {
    if (ctx.signal?.aborted) throw new PdfToolsError('cancelled');
    const size = await renderer.pageSize(index);
    let scale = args.dpi / 72;
    const pixels = size.width * size.height * scale * scale;
    if (pixels > MAX_PIXELS) scale *= Math.sqrt(MAX_PIXELS / pixels);
    const bytes = await renderer.render(index, scale, args.type, 0.9);
    files.push({
      name: `${base}-page-${String(index + 1).padStart(digits, '0')}.${ext}`,
      mime: args.type === 'png' ? 'image/png' : 'image/jpeg',
      bytes,
    });
    ctx.progress((i + 1) / (indices.length + 1));
  }
  const out = bundle(files, `${base}-images.zip`);
  ctx.progress(1);
  return { files: out };
}
