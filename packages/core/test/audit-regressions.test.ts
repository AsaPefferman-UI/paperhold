// Regression tests for the M6 security audit's hardening notes and its deferred coverage gap
// (docs/security-review.md).
import { zlibSync } from 'fflate';
import {
  concatTransformationMatrix,
  drawObject,
  PDFDocument,
  PDFName,
  popGraphicsState,
  pushGraphicsState,
} from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { fixtureBuffer } from '../fixtures/corpus.ts';
import { runOp } from '../src/dispatch.ts';
import type { OpContext } from '../src/protocol.ts';
import { expectValidPdf, noopCtx, pageTexts } from './helpers.ts';
import { qpdf } from './qpdf.ts';
import { nodeServices } from './services.ts';

const ctx: OpContext = { progress: () => {}, services: nodeServices };
const file = (name: string) => ({ name, bytes: fixtureBuffer(name) });

/** All page content and strings, uncompressed, so leftovers from removed pages are visible. */
async function rawText(bytes: Uint8Array): Promise<string> {
  const r = await qpdf(
    ['--qdf', '--object-streams=disable', '/in.pdf', '/out.pdf'],
    { 'in.pdf': bytes },
    ['out.pdf'],
  );
  return Buffer.from(r.files['out.pdf']!).toString('latin1');
}

describe('removed pages leave nothing behind', () => {
  it('split/extract: other pages are not in the file at all', async () => {
    const out = await runOp(
      'split',
      { file: file('simple.pdf'), mode: { kind: 'extract', ranges: '1' } },
      noopCtx,
    );
    const raw = await rawText(out.files[0]!.bytes);
    expect(raw).toContain('Hello from page 1');
    expect(raw).not.toContain('Hello from page 2');
    expect(raw).not.toContain('Hello from page 3');
  });

  it('organize: deleted pages are not in the file at all', async () => {
    const out = await runOp(
      'organize',
      { file: file('simple.pdf'), pages: [{ index: 2, rotate: 0 }] },
      noopCtx,
    );
    const raw = await rawText(out.files[0]!.bytes);
    expect(raw).toContain('Hello from page 3');
    expect(raw).not.toMatch(/Hello from page [12]/);
  });

  it('flatten: no form fields or field values remain, only the drawn text', async () => {
    const out = await runOp(
      'fillForm',
      { file: file('acroform.pdf'), values: { full_name: 'Secret Name' }, flatten: true },
      noopCtx,
    );
    const raw = await rawText(out.files[0]!.bytes);
    expect(raw).not.toMatch(/\/FT\s*\//); // no field dictionaries
    expect(raw).not.toMatch(/\/V\s*[(<]/); // no stored field values
    expect((await pageTexts(out.files[0]!.bytes))[0]).toContain('Secret Name'); // drawn on the page
  });
});

describe('hostile inputs', () => {
  it('fills a field literally named "__proto__" without touching object prototypes', async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage();
    doc.getForm().createTextField('__proto__').addToPage(page, { x: 50, y: 700 });
    const src = await doc.save();
    const values = Object.fromEntries([['__proto__', 'ok']]);
    const out = await runOp(
      'fillForm',
      { file: { name: 'p.pdf', bytes: src.buffer as ArrayBuffer }, values, flatten: false },
      noopCtx,
    );
    const filled = await PDFDocument.load(out.files[0]!.bytes);
    expect(filled.getForm().getTextField('__proto__').getText()).toBe('ok');
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('compress: an image stream that inflates beyond its declared size is left alone', async () => {
    // Declares 10x10 RGB (300 bytes) but inflates to 8 MB.
    const bomb = zlibSync(new Uint8Array(8 * 1024 * 1024));
    const padded = new Uint8Array(30_000); // over the 20 KB "worth re-encoding" threshold
    padded.set(bomb);
    const doc = await PDFDocument.create();
    const ref = doc.context.register(
      doc.context.stream(padded, {
        Type: 'XObject',
        Subtype: 'Image',
        Width: 10,
        Height: 10,
        ColorSpace: 'DeviceRGB',
        BitsPerComponent: 8,
        Filter: 'FlateDecode',
      }),
    );
    const page = doc.addPage([100, 100]);
    page.node.setXObject(PDFName.of('Im0'), ref);
    page.pushOperators(
      pushGraphicsState(),
      concatTransformationMatrix(100, 0, 0, 100, 0, 0),
      drawObject('Im0'),
      popGraphicsState(),
    );
    const src = await doc.save();
    const out = await runOp(
      'compress',
      { file: { name: 'bomb.pdf', bytes: src.buffer as ArrayBuffer }, preset: 'smallest' },
      ctx,
    );
    expect(await expectValidPdf(out.files[0]!.bytes)).toBe(1);
  });
});
