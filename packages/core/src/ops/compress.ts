// Compression per ADR 0003: re-encode large raster images as JPEG (platform codec), then let
// qpdf rebuild the file with object streams and maximum Flate. The original is kept whenever
// a step does not make it smaller.
import { unzlibSync } from 'fflate';
import {
  PDFArray,
  PDFDict,
  PDFName,
  PDFNumber,
  PDFRawStream,
  PDFRef,
  type PDFContext,
  type PDFObject,
} from 'pdf-lib';
import { PdfToolsError } from '../errors.ts';
import { unpredictPng } from '../images.ts';
import { baseName, PDF_MIME } from '../output.ts';
import { forFile, loadPdf } from '../pdf.ts';
import type { OpContext, OpOutput, SourceImage } from '../protocol.ts';
import { runQpdf } from '../qpdf.ts';

export type CompressPreset = 'high' | 'balanced' | 'smallest';

export interface CompressArgs {
  file: { name: string; bytes: ArrayBuffer };
  preset: CompressPreset;
}

/** Longest image side in pixels and JPEG quality per preset. */
export const PRESETS: Record<CompressPreset, { maxDim: number; quality: number }> = {
  high: { maxDim: 2400, quality: 0.85 },
  balanced: { maxDim: 1600, quality: 0.72 },
  smallest: { maxDim: 1100, quality: 0.55 },
};

/** Images smaller than this are not worth re-encoding. */
const MIN_IMAGE_BYTES = 20_000;

const lookup = (ctx: PDFContext, obj: PDFObject | undefined) =>
  obj instanceof PDFRef ? ctx.lookup(obj) : obj;

function name(ctx: PDFContext, obj: PDFObject | undefined): string | undefined {
  const v = lookup(ctx, obj);
  return v instanceof PDFName ? v.decodeText() : undefined;
}

function num(ctx: PDFContext, obj: PDFObject | undefined): number | undefined {
  const v = lookup(ctx, obj);
  return v instanceof PDFNumber ? v.asNumber() : undefined;
}

/** Channels for colour spaces we can convert faithfully, else undefined (image left alone). */
function channels(ctx: PDFContext, cs: PDFObject | undefined): 1 | 3 | undefined {
  const v = lookup(ctx, cs);
  if (v instanceof PDFName) {
    const n = v.decodeText();
    return n === 'DeviceRGB' ? 3 : n === 'DeviceGray' ? 1 : undefined;
  }
  if (v instanceof PDFArray && name(ctx, v.get(0)) === 'ICCBased') {
    const icc = lookup(ctx, v.get(1));
    const n = icc instanceof PDFRawStream ? num(ctx, icc.dict.get(PDFName.of('N'))) : undefined;
    return n === 3 ? 3 : n === 1 ? 1 : undefined;
  }
  return undefined;
}

/** Decide whether and how an image XObject can be re-encoded; undefined means leave it. */
function sourceOf(
  ctx: PDFContext,
  stream: PDFRawStream,
): { src: SourceImage; width: number; height: number } | undefined {
  const d = stream.dict;
  if (name(ctx, d.get(PDFName.of('Subtype'))) !== 'Image') return undefined;
  if (stream.contents.length < MIN_IMAGE_BYTES) return undefined;
  if (d.get(PDFName.of('ImageMask')) || d.get(PDFName.of('Decode'))) return undefined;
  if (lookup(ctx, d.get(PDFName.of('Mask'))) instanceof PDFArray) return undefined; // colour-key masks need exact colours
  if (num(ctx, d.get(PDFName.of('BitsPerComponent'))) !== 8) return undefined;
  const width = num(ctx, d.get(PDFName.of('Width')));
  const height = num(ctx, d.get(PDFName.of('Height')));
  const ch = channels(ctx, d.get(PDFName.of('ColorSpace')));
  if (!width || !height || !ch || width * height > 50_000_000) return undefined;
  let filter = lookup(ctx, d.get(PDFName.of('Filter')));
  let parms = lookup(ctx, d.get(PDFName.of('DecodeParms')));
  if (filter instanceof PDFArray) {
    if (filter.size() !== 1) return undefined;
    filter = lookup(ctx, filter.get(0));
    parms = parms instanceof PDFArray ? lookup(ctx, parms.get(0)) : parms;
  }
  const f = filter instanceof PDFName ? filter.decodeText() : undefined;
  if (f === 'DCTDecode') return { src: { kind: 'jpeg', bytes: stream.contents }, width, height };
  if (f !== 'FlateDecode') return undefined;
  const predictor =
    parms instanceof PDFDict ? (num(ctx, parms.get(PDFName.of('Predictor'))) ?? 1) : 1;
  // Inflate into a buffer of exactly the size the image needs, so a "zip bomb" stream cannot
  // allocate more than its declared dimensions (fflate throws if the data would overflow it).
  const expected = predictor >= 10 ? (width * ch + 1) * height : width * height * ch;
  let pixels: Uint8Array = unzlibSync(stream.contents, { out: new Uint8Array(expected) });
  if (predictor >= 10) pixels = unpredictPng(pixels, width, height, ch);
  else if (predictor !== 1) return undefined;
  if (pixels.length < width * height * ch) return undefined;
  return { src: { kind: 'raw', width, height, channels: ch, pixels }, width, height };
}

export async function compress(args: CompressArgs, ctx: OpContext): Promise<OpOutput> {
  const preset = PRESETS[args.preset];
  if (!preset) throw new PdfToolsError('invalid_input', 'Choose a compression level.');
  const original = new Uint8Array(args.file.bytes);
  return forFile(args.file.name, async () => {
    const doc = await loadPdf(original.slice());
    const pdf = doc.context;
    const encode = ctx.services?.encodeJpeg;
    let changed = false;
    if (encode) {
      const images = pdf.enumerateIndirectObjects().filter(([, o]) => o instanceof PDFRawStream);
      for (const [i, [ref, obj]] of images.entries()) {
        const stream = obj as PDFRawStream;
        let found: ReturnType<typeof sourceOf>;
        try {
          found = sourceOf(pdf, stream);
        } catch {
          found = undefined; // an image we cannot decode is left exactly as it was
        }
        if (found) {
          const scale = Math.min(1, preset.maxDim / Math.max(found.width, found.height));
          const w = Math.max(1, Math.round(found.width * scale));
          const h = Math.max(1, Math.round(found.height * scale));
          const jpeg = await encode(found.src, w, h, preset.quality).catch(() => undefined);
          if (jpeg && jpeg.length < stream.contents.length) {
            const dict = stream.dict.clone(pdf);
            dict.set(PDFName.of('Width'), PDFNumber.of(w));
            dict.set(PDFName.of('Height'), PDFNumber.of(h));
            dict.set(PDFName.of('ColorSpace'), PDFName.of('DeviceRGB'));
            dict.set(PDFName.of('BitsPerComponent'), PDFNumber.of(8));
            dict.set(PDFName.of('Filter'), PDFName.of('DCTDecode'));
            dict.delete(PDFName.of('DecodeParms'));
            dict.set(PDFName.of('Length'), PDFNumber.of(jpeg.length));
            pdf.assign(ref, PDFRawStream.of(dict, jpeg));
            changed = true;
          }
        }
        ctx.progress((0.7 * (i + 1)) / images.length);
      }
    }
    let best = changed ? await doc.save({ useObjectStreams: true }) : original;
    ctx.progress(0.75);
    if (ctx.services?.qpdf) {
      const { factory, locateFile } = ctx.services.qpdf;
      const r = await runQpdf(
        factory,
        [
          '--object-streams=generate',
          '--compress-streams=y',
          '--recompress-flate',
          '--compression-level=9',
          '--remove-unreferenced-resources=yes',
          '/in.pdf',
          '/out.pdf',
        ],
        { 'in.pdf': best },
        ['out.pdf'],
        locateFile,
      );
      const out = r.files['out.pdf'];
      // Exit 3 = success with warnings (common for slightly broken inputs).
      if ((r.code === 0 || r.code === 3) && out && out.length < best.length) best = out;
    }
    if (best.length >= original.length) best = original;
    ctx.progress(1);
    return {
      files: [{ name: `${baseName(args.file.name)}-compressed.pdf`, mime: PDF_MIME, bytes: best }],
    };
  });
}
