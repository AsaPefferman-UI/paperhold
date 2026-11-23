import { createCanvas } from '@napi-rs/canvas';
import { unzipSync, zlibSync } from 'fflate';
import {
  concatTransformationMatrix,
  drawObject,
  PDFDocument,
  PDFName,
  PDFRawStream,
  popGraphicsState,
  pushGraphicsState,
} from 'pdf-lib';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { describe, expect, it } from 'vitest';
import { fixtureBuffer, readFixture } from '../fixtures/corpus.ts';
import { runOp } from '../src/dispatch.ts';
import { jpegOrientation, orientationDegrees, sniffImage, unpredictPng } from '../src/images.ts';
import { pdfToImages, type PageRenderer } from '../src/ops/pdf-to-images.ts';
import type { OpContext } from '../src/protocol.ts';
import { expectMatchesGolden, expectValidPdf, noopCtx, pageTexts, renderPage } from './helpers.ts';
import { nodeServices } from './services.ts';

const ctx: OpContext = { progress: () => {}, services: nodeServices };
const img = (name: string, mime = '') => ({ name, bytes: fixtureBuffer(name), mime });
const file = (name: string) => ({ name, bytes: fixtureBuffer(name) });

describe('image helpers', () => {
  it('sniffs formats by magic bytes', () => {
    expect(sniffImage(readFixture('photo.jpg'))).toBe('jpeg');
    expect(sniffImage(readFixture('graphic.png'))).toBe('png');
    expect(sniffImage(readFixture('pixel.gif'))).toBe('gif');
    expect(sniffImage(readFixture('gradient.bmp'))).toBe('bmp');
    const heic = new Uint8Array([0, 0, 0, 24, ...new TextEncoder().encode('ftypheic')]);
    expect(sniffImage(heic)).toBe('heic');
    const avif = new Uint8Array([0, 0, 0, 24, ...new TextEncoder().encode('ftypavif')]);
    expect(sniffImage(avif)).toBe('avif');
    expect(sniffImage(readFixture('simple.pdf'))).toBe('unknown');
  });

  it('reads EXIF orientation and maps it to clockwise degrees', () => {
    expect(jpegOrientation(readFixture('photo.jpg'))).toBe(1);
    expect(jpegOrientation(readFixture('photo-exif-rotated.jpg'))).toBe(6);
    expect(jpegOrientation(new Uint8Array([0xff, 0xd8, 0xff, 0xe1, 0, 4, 1, 2]))).toBe(1);
    expect([1, 3, 6, 8, 2, 5, 7].map(orientationDegrees)).toEqual([0, 180, 90, 270, 0, 90, 270]);
  });

  it('undoes every PNG predictor', () => {
    // 2x2 RGB, rows encoded with filters Sub and Paeth; expected output is known.
    const raw = new Uint8Array([1, 10, 20, 30, 5, 5, 5, 4, 1, 1, 1, 2, 2, 2]);
    expect([...unpredictPng(raw, 2, 2, 3)]).toEqual([
      10, 20, 30, 15, 25, 35, 11, 21, 31, 17, 27, 37,
    ]);
    const up = new Uint8Array([0, 1, 2, 2, 1, 1, 3, 0, 0]);
    expect([...unpredictPng(up, 1, 3, 2)].slice(0, 4)).toEqual([1, 2, 2, 3]);
    expect(() => unpredictPng(new Uint8Array([9, 0]), 1, 1, 1)).toThrow(/unknown filter/);
    expect(() => unpredictPng(new Uint8Array([0]), 2, 2, 3)).toThrow(/truncated/);
  });
});

describe('imagesToPdf', () => {
  it('makes one page per image, in order, sized to fit', async () => {
    const out = await runOp(
      'imagesToPdf',
      { files: [img('photo.jpg'), img('graphic.png')], pageSize: 'fit', margin: 0 },
      ctx,
    );
    const bytes = out.files[0]!.bytes;
    expect(await expectValidPdf(bytes)).toBe(2);
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPage(0).getSize()).toEqual({ width: 600, height: 450 }); // 800x600 at 96 DPI
  });

  it('applies EXIF orientation so phone photos are upright', async () => {
    const out = await runOp(
      'imagesToPdf',
      { files: [img('photo-exif-rotated.jpg')], pageSize: 'a4', margin: 36 },
      ctx,
    );
    const page = (await PDFDocument.load(out.files[0]!.bytes)).getPage(0);
    expect(page.getWidth()).toBeLessThan(page.getHeight()); // portrait, because the photo is sideways
    await expectMatchesGolden(
      await renderPage(out.files[0]!.bytes, 1, 0.4),
      'images-exif-rotated-a4',
    );
  });

  it('uses a landscape page for landscape images on fixed sizes', async () => {
    const out = await runOp(
      'imagesToPdf',
      { files: [img('photo.jpg')], pageSize: 'letter', margin: 36 },
      ctx,
    );
    expect((await PDFDocument.load(out.files[0]!.bytes)).getPage(0).getSize()).toEqual({
      width: 792,
      height: 612,
    });
  });

  it('decodes other formats through the platform decoder', async () => {
    const out = await runOp(
      'imagesToPdf',
      { files: [img('pixel.gif', 'image/gif'), img('gradient.bmp')], pageSize: 'fit', margin: 0 },
      ctx,
    );
    expect(await expectValidPdf(out.files[0]!.bytes)).toBe(2);
  });

  it('gives typed errors for unsupported, damaged, or missing input', async () => {
    await expect(
      runOp('imagesToPdf', { files: [img('pixel.gif')], pageSize: 'fit', margin: 0 }, noopCtx),
    ).rejects.toMatchObject({ code: 'unsupported', message: expect.stringContaining('GIF') });
    await expect(
      runOp('imagesToPdf', { files: [img('simple.pdf')], pageSize: 'fit', margin: 0 }, ctx),
    ).rejects.toMatchObject({ code: 'unsupported' });
    const broken = readFixture('photo.jpg').slice(0, 200);
    await expect(
      runOp(
        'imagesToPdf',
        {
          files: [{ name: 'b.jpg', bytes: broken.buffer as ArrayBuffer, mime: '' }],
          pageSize: 'fit',
          margin: 0,
        },
        ctx,
      ),
    ).rejects.toMatchObject({ code: 'damaged', message: expect.stringContaining('b.jpg') });
    await expect(
      runOp('imagesToPdf', { files: [], pageSize: 'fit', margin: 0 }, ctx),
    ).rejects.toMatchObject({ code: 'invalid_input' });
    const failing = { ...ctx, services: { decodeImage: () => Promise.reject(new Error('boom')) } };
    await expect(
      runOp('imagesToPdf', { files: [img('pixel.gif')], pageSize: 'fit', margin: 0 }, failing),
    ).rejects.toMatchObject({ code: 'damaged' });
  });
});

describe('compress', () => {
  it('shrinks image-heavy PDFs a lot and keeps them valid and readable', async () => {
    const before = fixtureBuffer('images.pdf').byteLength;
    const out = await runOp('compress', { file: file('images.pdf'), preset: 'balanced' }, ctx);
    const bytes = out.files[0]!.bytes;
    expect(out.files[0]!.name).toBe('images-compressed.pdf');
    expect(bytes.length).toBeLessThan(before * 0.3);
    expect(await expectValidPdf(bytes)).toBe(2);
    expect((await pageTexts(bytes))[0]).toContain('Image page 1');
    await expectMatchesGolden(await renderPage(bytes, 1, 0.3), 'compress-images-balanced', 0.05);
  });

  it('orders presets by size', async () => {
    const sizes = [];
    for (const preset of ['high', 'balanced', 'smallest'] as const) {
      sizes.push(
        (await runOp('compress', { file: file('scanned.pdf'), preset }, ctx)).files[0]!.bytes
          .length,
      );
    }
    expect(sizes[0]).toBeGreaterThanOrEqual(sizes[1]!);
    expect(sizes[1]).toBeGreaterThanOrEqual(sizes[2]!);
    expect(sizes[2]).toBeLessThan(fixtureBuffer('scanned.pdf').byteLength);
  });

  it('handles predictor-encoded Flate images', async () => {
    // Build a PDF whose image uses /Predictor 15 (PNG Up filter on every row).
    const w = 400;
    const h = 300;
    const rows = new Uint8Array((w * 3 + 1) * h);
    let seed = 1;
    for (let y = 0; y < h; y++) {
      rows[y * (w * 3 + 1)] = 2;
      for (let x = 0; x < w * 3; x++) {
        seed = (Math.imul(seed, 1103515245) + 12345) & 0x7fffffff;
        rows[y * (w * 3 + 1) + 1 + x] = (seed >> 16) & 0xff; // noise: Flate cannot shrink it
      }
    }
    const doc = await PDFDocument.create();
    const ref = doc.context.register(
      doc.context.stream(zlibSync(rows), {
        Type: 'XObject',
        Subtype: 'Image',
        Width: w,
        Height: h,
        ColorSpace: 'DeviceRGB',
        BitsPerComponent: 8,
        Filter: 'FlateDecode',
        DecodeParms: { Predictor: 15, Colors: 3, Columns: w, BitsPerComponent: 8 },
      }),
    );
    const page = doc.addPage([w, h]);
    page.node.setXObject(PDFName.of('Im0'), ref);
    page.pushOperators(
      pushGraphicsState(),
      concatTransformationMatrix(w, 0, 0, h, 0, 0),
      drawObject('Im0'),
      popGraphicsState(),
    );
    const src = await doc.save();
    const out = await runOp(
      'compress',
      { file: { name: 'p.pdf', bytes: src.buffer as ArrayBuffer }, preset: 'smallest' },
      ctx,
    );
    expect(out.files[0]!.bytes.length).toBeLessThan(src.length);
    const after = await PDFDocument.load(out.files[0]!.bytes);
    const filters = after.context
      .enumerateIndirectObjects()
      .map(([, o]) =>
        o instanceof PDFRawStream ? o.dict.get(PDFName.of('Filter'))?.toString() : undefined,
      );
    expect(filters).toContain('/DCTDecode');
    expect(await expectValidPdf(out.files[0]!.bytes)).toBe(1);
  });

  it('never makes a file bigger', async () => {
    const before = fixtureBuffer('simple.pdf').byteLength;
    const out = await runOp('compress', { file: file('simple.pdf'), preset: 'smallest' }, ctx);
    expect(out.files[0]!.bytes.length).toBeLessThanOrEqual(before);
    expect(await expectValidPdf(out.files[0]!.bytes)).toBe(3);
  });

  it('still works without platform services (structure only)', async () => {
    const out = await runOp(
      'compress',
      { file: file('large-page-count.pdf'), preset: 'balanced' },
      noopCtx,
    );
    expect(out.files[0]!.bytes.length).toBeLessThanOrEqual(
      fixtureBuffer('large-page-count.pdf').byteLength,
    );
  });

  it('rejects encrypted files and unknown presets', async () => {
    await expect(
      runOp('compress', { file: file('encrypted.pdf'), preset: 'balanced' }, ctx),
    ).rejects.toMatchObject({ code: 'encrypted' });
    await expect(
      runOp('compress', { file: file('simple.pdf'), preset: 'tiny' as never }, ctx),
    ).rejects.toMatchObject({ code: 'invalid_input' });
  });
});

/** pdf.js + @napi-rs/canvas renderer, the Node twin of the browser renderer. */
async function nodeRenderer(
  bytes: Uint8Array,
): Promise<PageRenderer & { destroy(): Promise<void> }> {
  const task = getDocument({ data: bytes.slice(), verbosity: 0 });
  const doc = await task.promise;
  return {
    pageCount: doc.numPages,
    async pageSize(i) {
      const v = (await doc.getPage(i + 1)).getViewport({ scale: 1 });
      return { width: v.width, height: v.height };
    },
    async render(i, scale, type, quality) {
      const page = await doc.getPage(i + 1);
      const viewport = page.getViewport({ scale });
      const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
      await page.render({
        canvas: canvas as never,
        canvasContext: canvas.getContext('2d') as never,
        viewport,
      }).promise;
      return new Uint8Array(
        type === 'png' ? await canvas.encode('png') : await canvas.encode('jpeg', quality * 100),
      );
    },
    destroy: () => task.destroy(),
  };
}

describe('pdfToImages', () => {
  it('renders the chosen pages at the chosen DPI and zips them', async () => {
    const r = await nodeRenderer(readFixture('simple.pdf'));
    const out = await pdfToImages(
      { name: 'simple.pdf', type: 'png', dpi: 72, pages: '1, 3' },
      r,
      noopCtx,
    );
    await r.destroy();
    const zip = unzipSync(out.files[0]!.bytes);
    expect(Object.keys(zip)).toEqual(['simple-page-1.png', 'simple-page-3.png']);
    expect(sniffImage(zip['simple-page-1.png']!)).toBe('png');
  });

  it('returns a single image directly, pads page numbers, and caps huge renders', async () => {
    const r = await nodeRenderer(readFixture('large-page-count.pdf'));
    const scales: number[] = [];
    const spy = {
      ...r,
      render: (i: number, s: number, t: 'png' | 'jpeg', q: number) => (
        scales.push(s),
        r.render(i, s, t, q)
      ),
    };
    const out = await pdfToImages(
      { name: 'big.pdf', type: 'jpeg', dpi: 600, pages: '7' },
      spy,
      noopCtx,
    );
    await r.destroy();
    expect(out.files[0]!.name).toBe('big-page-0007.jpg');
    expect(out.files[0]!.mime).toBe('image/jpeg');
    expect(612 * 792 * scales[0]! ** 2).toBeLessThanOrEqual(16_000_001);
  });

  it('validates DPI, pages, and honours cancellation', async () => {
    const r = await nodeRenderer(readFixture('simple.pdf'));
    await expect(
      pdfToImages({ name: 'a.pdf', type: 'png', dpi: 5 }, r, noopCtx),
    ).rejects.toMatchObject({ code: 'invalid_input' });
    await expect(
      pdfToImages({ name: 'a.pdf', type: 'png', dpi: 72, pages: '9' }, r, noopCtx),
    ).rejects.toMatchObject({ code: 'invalid_input' });
    const ctl = new AbortController();
    ctl.abort();
    await expect(
      pdfToImages({ name: 'a.pdf', type: 'png', dpi: 72 }, r, { ...noopCtx, signal: ctl.signal }),
    ).rejects.toMatchObject({ code: 'cancelled' });
    await r.destroy();
  });
});
