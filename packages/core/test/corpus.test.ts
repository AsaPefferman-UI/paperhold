import { describe, expect, it } from 'vitest';
import { CORPUS, readFixture } from '../fixtures/corpus.ts';
import { PdfToolsError } from '../src/errors.ts';
import { loadPdf, looksLikePdf } from '../src/pdf.ts';
import { expectValidPdf, pageTexts } from './helpers.ts';

describe('fixture corpus', () => {
  for (const [name, fx] of Object.entries(CORPUS)) {
    it(`${name}: loads or fails with a typed error`, async () => {
      const bytes = readFixture(name);
      if (fx.kind === 'valid') {
        const doc = await loadPdf(bytes);
        expect(doc.getPageCount()).toBe(fx.pages);
        expect(await expectValidPdf(bytes)).toBe(fx.pages);
        if (fx.text) expect((await pageTexts(bytes))[0]).toContain(fx.text);
      } else if (fx.kind === 'image') {
        expect(bytes.length).toBeGreaterThan(0);
      } else if (fx.kind === 'encrypted') {
        await expect(loadPdf(bytes)).rejects.toMatchObject({ code: 'encrypted' });
      } else {
        try {
          const doc = await loadPdf(bytes);
          expect(doc.getPageCount()).toBeGreaterThan(0); // recovered
        } catch (err) {
          expect(err).toBeInstanceOf(PdfToolsError);
          expect(fx.errors).toContain((err as PdfToolsError).code);
        }
      }
    });
  }
});

describe('looksLikePdf', () => {
  it('accepts a header after leading junk within 1 KB', () => {
    const bytes = new TextEncoder().encode('junk\n%PDF-1.7\n');
    expect(looksLikePdf(bytes)).toBe(true);
  });
  it('rejects text and empty input', () => {
    expect(looksLikePdf(new TextEncoder().encode('hello'))).toBe(false);
    expect(looksLikePdf(new Uint8Array(0))).toBe(false);
  });
});

describe('loadPdf limits', () => {
  it('refuses documents over the page cap', async () => {
    await expect(
      loadPdf(readFixture('large-page-count.pdf'), { maxPages: 999 }),
    ).rejects.toMatchObject({
      code: 'too_many_pages',
    });
  });
});
