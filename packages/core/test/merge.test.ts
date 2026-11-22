import { describe, expect, it } from 'vitest';
import { fixtureBuffer } from '../fixtures/corpus.ts';
import { runOp } from '../src/dispatch.ts';
import { expectValidPdf, noopCtx, pageTexts } from './helpers.ts';

const file = (name: string) => ({ name, bytes: fixtureBuffer(name) });

describe('merge', () => {
  it('concatenates pages in the given order and produces a valid PDF', async () => {
    const progress: number[] = [];
    const out = await runOp(
      'merge',
      { files: [file('pdf-1.4.pdf'), file('simple.pdf'), file('pdf-2.0.pdf')] },
      { progress: (f) => progress.push(f) },
    );
    expect(out.files).toHaveLength(1);
    const [result] = out.files;
    expect(result?.name).toBe('merged.pdf');
    expect(result?.mime).toBe('application/pdf');
    const bytes = result!.bytes;
    expect(await expectValidPdf(bytes)).toBe(7);
    const texts = await pageTexts(bytes);
    expect(texts[0]).toContain('PDF 1.4 page 1');
    expect(texts[2]).toContain('Hello from page 1');
    expect(texts[6]).toContain('PDF 2.0 page 2');
    expect(progress.at(-1)).toBe(1);
    expect(progress).toEqual([...progress].sort((a, b) => a - b));
  });

  it('keeps form fields and annotations from the inputs', async () => {
    const out = await runOp(
      'merge',
      { files: [file('acroform.pdf'), file('annotations.pdf')] },
      noopCtx,
    );
    expect(await expectValidPdf(out.files[0]!.bytes)).toBe(2);
  });

  it('handles Unicode filenames and a custom output name', async () => {
    const out = await runOp(
      'merge',
      { files: [file('unicode-résumé-日本語.pdf'), file('simple.pdf')], outputName: 'résumé.pdf' },
      noopCtx,
    );
    expect(out.files[0]?.name).toBe('résumé.pdf');
  });

  it('requires at least two files', async () => {
    await expect(runOp('merge', { files: [file('simple.pdf')] }, noopCtx)).rejects.toMatchObject({
      code: 'invalid_input',
    });
  });

  it('names the file that is encrypted', async () => {
    await expect(
      runOp('merge', { files: [file('simple.pdf'), file('encrypted.pdf')] }, noopCtx),
    ).rejects.toMatchObject({
      code: 'encrypted',
      message: expect.stringContaining('encrypted.pdf'),
    });
  });

  for (const bad of [
    'truncated.pdf',
    'not-a-pdf.pdf',
    'empty.pdf',
    'nested-bomb.pdf',
    'broken-xref.pdf',
  ]) {
    it(`fails cleanly or recovers on ${bad}`, async () => {
      try {
        const out = await runOp('merge', { files: [file('simple.pdf'), file(bad)] }, noopCtx);
        expect(await expectValidPdf(out.files[0]!.bytes)).toBeGreaterThanOrEqual(3);
      } catch (err) {
        expect(err).toMatchObject({ code: expect.stringMatching(/^(damaged|too_large)$/) });
        expect((err as Error).message).toContain(bad);
      }
    });
  }
});
