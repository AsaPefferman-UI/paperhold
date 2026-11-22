import { unzipSync } from 'fflate';
import { degrees, PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { fixtureBuffer, readFixture } from '../fixtures/corpus.ts';
import { runOp } from '../src/dispatch.ts';
import { bundle } from '../src/output.ts';
import { parsePageRanges, rangeIndices } from '../src/ranges.ts';
import { expectMatchesGolden, expectValidPdf, noopCtx, pageTexts, renderPage } from './helpers.ts';

const file = (name: string) => ({ name, bytes: fixtureBuffer(name) });

describe('parsePageRanges', () => {
  it('parses singles, ranges, open ends, and spaces', () => {
    expect(parsePageRanges('1-3, 5, 8-', 10)).toEqual([
      { start: 0, end: 2 },
      { start: 4, end: 4 },
      { start: 7, end: 9 },
    ]);
    expect(parsePageRanges('-2', 5)).toEqual([{ start: 0, end: 1 }]);
    expect(rangeIndices(parsePageRanges('3,1-2', 3))).toEqual([2, 0, 1]);
  });

  it.each([
    ['', /at least one page/],
    ['abc', /not a page/],
    ['-', /not a page/],
    ['0', /start at 1/],
    ['4', /past the last page/],
    ['3-1', /backwards/],
    ['1-2-3', /not a page/],
  ])('rejects %j with a helpful message', (input, message) => {
    expect(() => parsePageRanges(input, 3)).toThrow(message);
  });
});

describe('split', () => {
  it('extracts listed pages into one PDF, in order', async () => {
    const out = await runOp(
      'split',
      { file: file('large-page-count.pdf'), mode: { kind: 'extract', ranges: '10, 2-3' } },
      noopCtx,
    );
    expect(out.files).toHaveLength(1);
    expect(out.files[0]!.name).toBe('large-page-count-pages-10,2-3.pdf');
    const texts = await pageTexts(out.files[0]!.bytes);
    expect(texts).toEqual(['Page 10', 'Page 2', 'Page 3']);
  });

  it('splits every N pages into a zip of valid PDFs', async () => {
    const out = await runOp(
      'split',
      { file: file('simple.pdf'), mode: { kind: 'every', every: 2 } },
      noopCtx,
    );
    expect(out.files[0]!.mime).toBe('application/zip');
    const entries = unzipSync(out.files[0]!.bytes);
    expect(Object.keys(entries)).toEqual(['simple-pages-1-2.pdf', 'simple-pages-3.pdf']);
    expect(await expectValidPdf(entries['simple-pages-1-2.pdf']!)).toBe(2);
    expect(await expectValidPdf(entries['simple-pages-3.pdf']!)).toBe(1);
  });

  it('makes one file per range', async () => {
    const out = await runOp(
      'split',
      { file: file('simple.pdf'), mode: { kind: 'ranges', ranges: '1, 2-3' } },
      noopCtx,
    );
    expect(Object.keys(unzipSync(out.files[0]!.bytes))).toHaveLength(2);
  });

  it('rejects bad input with typed errors', async () => {
    await expect(
      runOp('split', { file: file('simple.pdf'), mode: { kind: 'every', every: 0 } }, noopCtx),
    ).rejects.toMatchObject({ code: 'invalid_input' });
    await expect(
      runOp('split', { file: file('simple.pdf'), mode: { kind: 'extract', ranges: '9' } }, noopCtx),
    ).rejects.toMatchObject({ code: 'invalid_input' });
    await expect(
      runOp('split', { file: file('encrypted.pdf'), mode: { kind: 'every', every: 1 } }, noopCtx),
    ).rejects.toMatchObject({ code: 'encrypted' });
  });
});

describe('bundle', () => {
  it('passes a single file through and de-duplicates names inside zips', () => {
    const f = { name: 'a.pdf', mime: 'application/pdf', bytes: new Uint8Array([1]) };
    expect(bundle([f], 'x.zip')).toEqual([f]);
    const [zip] = bundle([f, f], 'x.zip');
    expect(Object.keys(unzipSync(zip!.bytes))).toEqual(['a.pdf', 'a (2).pdf']);
  });
});

describe('organize', () => {
  it('reorders, rotates, duplicates and deletes pages', async () => {
    const out = await runOp(
      'organize',
      {
        file: file('simple.pdf'),
        pages: [
          { index: 2, rotate: 90 },
          { index: 0, rotate: 0 },
          { index: 2, rotate: 180 },
        ],
      },
      noopCtx,
    );
    const bytes = out.files[0]!.bytes;
    expect(await expectValidPdf(bytes)).toBe(3);
    expect(await pageTexts(bytes)).toEqual([
      'Hello from page 3',
      'Hello from page 1',
      'Hello from page 3',
    ]);
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPages().map((p) => p.getRotation().angle)).toEqual([90, 0, 180]);
  });

  it('adds to an existing rotation', async () => {
    const src = await PDFDocument.load(readFixture('simple.pdf'));
    src.getPage(0).setRotation(degrees(270));
    const bytes = await src.save();
    const out = await runOp(
      'organize',
      {
        file: { name: 'r.pdf', bytes: bytes.buffer as ArrayBuffer },
        pages: [{ index: 0, rotate: 180 }],
      },
      noopCtx,
    );
    expect((await PDFDocument.load(out.files[0]!.bytes)).getPage(0).getRotation().angle).toBe(90);
  });

  it('rejects empty, out-of-range, and non-quarter turns', async () => {
    for (const pages of [[], [{ index: 5, rotate: 0 }], [{ index: 0, rotate: 45 }]]) {
      await expect(
        runOp('organize', { file: file('simple.pdf'), pages: pages as never }, noopCtx),
      ).rejects.toMatchObject({ code: 'invalid_input' });
    }
  });
});

describe('page numbers', () => {
  it('numbers selected pages with a template', async () => {
    const out = await runOp(
      'pageNumbers',
      {
        file: file('simple.pdf'),
        position: 'bottom-center',
        format: 'Page {n} of {total}',
        startAt: 1,
        fontSize: 12,
        pages: '2-',
      },
      noopCtx,
    );
    const texts = await pageTexts(out.files[0]!.bytes);
    expect(texts[0]).not.toContain('Page 1 of');
    expect(texts[1]).toContain('Page 1 of 2');
    expect(texts[2]).toContain('Page 2 of 2');
    await expectMatchesGolden(
      await renderPage(out.files[0]!.bytes, 2),
      'page-numbers-bottom-center',
    );
  });

  it('keeps numbers upright and in the right corner on rotated pages', async () => {
    const src = await PDFDocument.load(readFixture('simple.pdf'));
    src.getPage(0).setRotation(degrees(90));
    const bytes = await src.save();
    const out = await runOp(
      'pageNumbers',
      {
        file: { name: 'rot.pdf', bytes: bytes.buffer as ArrayBuffer },
        position: 'top-right',
        format: '{n}',
        startAt: 7,
        fontSize: 24,
      },
      noopCtx,
    );
    await expectMatchesGolden(
      await renderPage(out.files[0]!.bytes, 1),
      'page-numbers-rotated-90-top-right',
    );
  });

  it('validates options and non-Latin text', async () => {
    const base = {
      file: file('simple.pdf'),
      position: 'bottom-center' as const,
      startAt: 1,
      fontSize: 12,
    };
    await expect(
      runOp('pageNumbers', { ...base, format: 'no token' }, noopCtx),
    ).rejects.toMatchObject({ code: 'invalid_input' });
    await expect(
      runOp('pageNumbers', { ...base, format: '{n}', fontSize: 500 }, noopCtx),
    ).rejects.toMatchObject({ code: 'invalid_input' });
    await expect(
      runOp('pageNumbers', { ...base, format: 'Стр. {n}' }, noopCtx),
    ).rejects.toMatchObject({ code: 'invalid_input', message: expect.stringContaining('Latin') });
  });
});

describe('watermark', () => {
  it('stamps diagonal semi-transparent text on every page', async () => {
    const out = await runOp(
      'watermark',
      {
        file: file('simple.pdf'),
        text: 'CONFIDENTIAL',
        fontSize: 72,
        opacity: 0.3,
        angle: 45,
        color: 'red',
      },
      noopCtx,
    );
    const bytes = out.files[0]!.bytes;
    expect(await expectValidPdf(bytes)).toBe(3);
    for (const t of await pageTexts(bytes)) expect(t).toContain('CONFIDENTIAL');
    await expectMatchesGolden(await renderPage(bytes, 1), 'watermark-diagonal-red');
  });

  it('validates text and options', async () => {
    const base = {
      file: file('simple.pdf'),
      fontSize: 48,
      opacity: 0.3,
      angle: 0,
      color: 'gray' as const,
    };
    await expect(runOp('watermark', { ...base, text: '  ' }, noopCtx)).rejects.toMatchObject({
      code: 'invalid_input',
    });
    await expect(
      runOp('watermark', { ...base, text: 'x', opacity: 2 }, noopCtx),
    ).rejects.toMatchObject({ code: 'invalid_input' });
    await expect(runOp('watermark', { ...base, text: '機密' }, noopCtx)).rejects.toMatchObject({
      code: 'invalid_input',
    });
    await expect(
      runOp('watermark', { ...base, text: 'x', color: 'pink' as never }, noopCtx),
    ).rejects.toMatchObject({ code: 'invalid_input' });
  });
});
