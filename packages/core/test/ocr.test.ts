import { gunzipSync } from 'fflate';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { fixtureBuffer, readFixture, SCANNED_TEXT } from '../fixtures/corpus.ts';
import { runOp } from '../src/dispatch.ts';
import { createOcrEngine, parseTsv, type OcrEngine, type TessFactory } from '../src/ocr.ts';
import { expectValidPdf, noopCtx, pageTexts, renderPage } from './helpers.ts';

const require = createRequire(import.meta.url);
const factory = require('tesseract.js-core/tesseract-core-simd-lstm.js') as TessFactory;
const wasm = readFileSync(require.resolve('tesseract.js-core/tesseract-core-simd-lstm.wasm'));
const eng = gunzipSync(
  readFileSync(require.resolve('@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz')),
);

describe('parseTsv', () => {
  it('keeps word rows with a box and text, and ignores the rest', () => {
    const tsv = [
      'level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext',
      '1\t1\t0\t0\t0\t0\t0\t0\t100\t100\t-1\t',
      '5\t1\t1\t1\t1\t1\t10\t20\t30\t12\t95.5\tHello',
      '5\t1\t1\t1\t1\t2\t50\t20\t0\t12\t90\tzero-width',
      '5\t1\t1\t1\t1\t3\t60\t20\t10\t12\t90\t  ',
      '5\t1',
    ].join('\n');
    expect(parseTsv(tsv)).toEqual([
      { text: 'Hello', left: 10, top: 20, width: 30, height: 12, confidence: 95.5 },
    ]);
  });
});

describe('OCR engine and text layer', () => {
  let engine: OcrEngine;
  beforeAll(async () => {
    engine = await createOcrEngine(factory, wasm, [{ code: 'eng', data: eng }]);
  });
  afterAll(() => engine.end());

  it('makes a scanned PDF searchable without changing how it looks', async () => {
    const src = readFixture('scanned.pdf');
    const pages = [];
    for (let i = 0; i < 2; i++) {
      const img = await renderPage(src, i + 1, 2); // 144 DPI
      pages.push({
        index: i,
        imageWidth: img.width,
        imageHeight: img.height,
        words: engine.recognize(img.png),
      });
    }
    expect(pages[0]!.words.map((w) => w.text).join(' ')).toContain('quick brown fox');
    const out = await runOp(
      'addTextLayer',
      { file: { name: 'scanned.pdf', bytes: src.slice().buffer as ArrayBuffer }, pages },
      noopCtx,
    );
    const bytes = out.files[0]!.bytes;
    expect(out.files[0]!.name).toBe('scanned-searchable.pdf');
    expect(await expectValidPdf(bytes)).toBe(2);
    const texts = await pageTexts(bytes);
    expect(texts[0]).toMatch(/quick\s+brown\s+fox/);
    expect(texts[0]).toContain('4417');
    expect(texts[1]).toContain(SCANNED_TEXT[1]!.split('\n')[1]!.split(' ')[0]);
    // Invisible text: the rendered page is pixel-identical to the input.
    const before = await renderPage(src, 1, 0.5);
    const after = await renderPage(bytes, 1, 0.5);
    let diff = 0;
    for (let i = 0; i < before.data.length; i++) if (before.data[i] !== after.data[i]) diff++;
    expect(diff).toBe(0);
  });

  it('drops characters the text-layer font cannot encode instead of failing', async () => {
    const out = await runOp(
      'addTextLayer',
      {
        file: { name: 'simple.pdf', bytes: fixtureBuffer('simple.pdf') },
        pages: [
          {
            index: 0,
            imageWidth: 612,
            imageHeight: 792,
            words: [
              { text: 'café→東京', left: 72, top: 600, width: 80, height: 14, confidence: 90 },
            ],
          },
        ],
      },
      noopCtx,
    );
    expect((await pageTexts(out.files[0]!.bytes))[0]).toContain('café');
  });

  it('rejects results that do not match the PDF', async () => {
    const bad = [{ index: 9, imageWidth: 10, imageHeight: 10, words: [] }];
    await expect(
      runOp(
        'addTextLayer',
        { file: { name: 's.pdf', bytes: fixtureBuffer('simple.pdf') }, pages: bad },
        noopCtx,
      ),
    ).rejects.toMatchObject({ code: 'invalid_input' });
    await expect(
      runOp(
        'addTextLayer',
        { file: { name: 's.pdf', bytes: fixtureBuffer('simple.pdf') }, pages: null as never },
        noopCtx,
      ),
    ).rejects.toMatchObject({ code: 'invalid_input' });
  });

  it('refuses to start without a language or with a bad language code', async () => {
    await expect(createOcrEngine(factory, wasm, [])).rejects.toMatchObject({
      code: 'invalid_input',
    });
    await expect(
      createOcrEngine(factory, wasm, [{ code: '../x', data: eng }]),
    ).rejects.toMatchObject({ code: 'invalid_input' });
  });

  it('reports an unreadable image as a typed error', () => {
    expect(() => engine.recognize(new Uint8Array([1, 2, 3]))).toThrow(
      expect.objectContaining({ code: 'damaged' }),
    );
  });
});
