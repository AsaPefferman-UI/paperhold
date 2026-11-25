// Writes OCR results onto pages as an invisible text layer.
import {
  beginText,
  endText,
  popGraphicsState,
  pushGraphicsState,
  setCharacterSqueeze,
  setFontAndSize,
  setTextMatrix,
  setTextRenderingMode,
  showText,
  StandardFonts,
  TextRenderingMode,
  type PDFFont,
} from 'pdf-lib';
import { PdfToolsError } from '../errors.ts';
import type { OcrWord } from '../ocr.ts';
import { baseName, PDF_MIME } from '../output.ts';
import { forFile, loadPdf, savePdf } from '../pdf.ts';
import type { OpContext, OpOutput } from '../protocol.ts';
import { toUserSpace, visualPage } from '../stamp.ts';

export interface TextLayerPage {
  /** 0-based page index. */
  index: number;
  /** Size of the image the words were found in (it shows the page as displayed). */
  imageWidth: number;
  imageHeight: number;
  words: OcrWord[];
}

export interface TextLayerArgs {
  file: { name: string; bytes: ArrayBuffer };
  pages: TextLayerPage[];
}

/** Keep only characters the standard font can encode; drop the rest rather than fail the page. */
function encodable(font: PDFFont, text: string, cache: Map<string, boolean>): string {
  let out = '';
  for (const ch of text) {
    let ok = cache.get(ch);
    if (ok === undefined) {
      try {
        font.encodeText(ch);
        ok = true;
      } catch {
        ok = false;
      }
      cache.set(ch, ok);
    }
    if (ok) out += ch;
  }
  return out;
}

/**
 * Add recognised words as invisible text (render mode 3) exactly over where they appear, so the
 * PDF looks unchanged but can be searched, selected, and read aloud.
 */
export async function addTextLayer(args: TextLayerArgs, ctx: OpContext): Promise<OpOutput> {
  if (!Array.isArray(args.pages)) throw new PdfToolsError('invalid_input');
  return forFile(args.file.name, async () => {
    const doc = await loadPdf(args.file.bytes);
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const pages = doc.getPages();
    const cache = new Map<string, boolean>();
    for (const [i, p] of args.pages.entries()) {
      const page = pages[p.index];
      if (!page || !(p.imageWidth > 0) || !(p.imageHeight > 0)) {
        throw new PdfToolsError('invalid_input', 'OCR results do not match this PDF.');
      }
      const { width: W, height: H } = visualPage(page);
      const sx = W / p.imageWidth;
      const sy = H / p.imageHeight;
      const key = page.node.newFontDictionary(font.name, font.ref);
      const ops = [
        pushGraphicsState(),
        beginText(),
        setTextRenderingMode(TextRenderingMode.Invisible),
      ];
      for (const w of p.words) {
        const text = encodable(font, w.text, cache);
        if (!text) continue;
        const size = Math.max(1, w.height * sy * 0.85);
        const natural = font.widthOfTextAtSize(text, size);
        const target = w.width * sx;
        // Baseline near the bottom of the word box, in the page as displayed.
        const o = toUserSpace(
          page,
          w.left * sx,
          H - (w.top + w.height) * sy + w.height * sy * 0.15,
        );
        const a = (o.angle * Math.PI) / 180;
        ops.push(
          setFontAndSize(key, size),
          setCharacterSqueeze(natural > 0 ? (100 * target) / natural : 100),
          setTextMatrix(Math.cos(a), Math.sin(a), -Math.sin(a), Math.cos(a), o.x, o.y),
          showText(font.encodeText(text)),
        );
      }
      ops.push(endText(), popGraphicsState());
      page.pushOperators(...ops);
      ctx.progress((i + 1) / (args.pages.length + 1));
    }
    const bytes = await savePdf(doc);
    ctx.progress(1);
    return {
      files: [{ name: `${baseName(args.file.name)}-searchable.pdf`, mime: PDF_MIME, bytes }],
    };
  });
}
