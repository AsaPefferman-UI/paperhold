import { degrees, PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { ENCRYPTED_PASSWORD, fixtureBuffer, readFixture } from '../fixtures/corpus.ts';
import { runOp } from '../src/dispatch.ts';
import type { FormField } from '../src/ops/forms.ts';
import type { OpContext } from '../src/protocol.ts';
import {
  expectMatchesGolden,
  expectValidPdf,
  noopCtx,
  openWithPdfjs,
  pageTexts,
  renderPage,
} from './helpers.ts';
import { qpdf } from './qpdf.ts';
import { nodeServices } from './services.ts';

const ctx: OpContext = { progress: () => {}, services: nodeServices };
const file = (name: string) => ({ name, bytes: fixtureBuffer(name) });
const bytesFile = (name: string, bytes: Uint8Array) => ({
  name,
  bytes: bytes.slice().buffer as ArrayBuffer,
});

describe('forms', () => {
  it('lists fields with their types, values and options', async () => {
    const out = await runOp('inspectForm', { file: file('acroform.pdf') }, noopCtx);
    const fields = out.data as FormField[];
    expect(out.files).toEqual([]);
    expect(fields.map((f) => [f.name, f.type])).toEqual([
      ['full_name', 'text'],
      ['agree', 'checkbox'],
      ['color', 'dropdown'],
      ['size', 'radio'],
      ['notes', 'text'],
    ]);
    expect(fields.find((f) => f.name === 'color')).toMatchObject({
      options: ['Red', 'Green', 'Blue'],
    });
    expect(fields.find((f) => f.name === 'notes')).toMatchObject({ multiline: true });
  });

  it('returns no fields for a PDF without a form', async () => {
    expect((await runOp('inspectForm', { file: file('simple.pdf') }, noopCtx)).data).toEqual([]);
  });

  it('fills every field type and keeps the form editable', async () => {
    const out = await runOp(
      'fillForm',
      {
        file: file('acroform.pdf'),
        values: {
          full_name: 'Ada Lovelace',
          agree: true,
          color: 'Green',
          size: 'M',
          notes: 'Line one\nLine two',
        },
        flatten: false,
      },
      noopCtx,
    );
    const bytes = out.files[0]!.bytes;
    expect(out.files[0]!.name).toBe('acroform-filled.pdf');
    expect(await expectValidPdf(bytes)).toBe(1);
    const form = (await PDFDocument.load(bytes)).getForm();
    expect(form.getTextField('full_name').getText()).toBe('Ada Lovelace');
    expect(form.getCheckBox('agree').isChecked()).toBe(true);
    expect(form.getDropdown('color').getSelected()).toEqual(['Green']);
    expect(form.getRadioGroup('size').getSelected()).toBe('M');
    // Another reader (pdf.js) sees the values too.
    const task = openWithPdfjs(bytes);
    const annots = await (await (await task.promise).getPage(1)).getAnnotations();
    await task.destroy();
    expect(annots.find((a) => a.fieldName === 'full_name')?.fieldValue).toBe('Ada Lovelace');
  });

  it('flattens: values become page content and fields disappear', async () => {
    const out = await runOp(
      'fillForm',
      { file: file('acroform.pdf'), values: { full_name: 'Grace Hopper' }, flatten: true },
      noopCtx,
    );
    const bytes = out.files[0]!.bytes;
    expect((await PDFDocument.load(bytes)).getForm().getFields()).toHaveLength(0);
    expect((await pageTexts(bytes))[0]).toContain('Grace Hopper');
    await expectMatchesGolden(await renderPage(bytes, 1), 'form-flattened');
  });

  it('rejects unknown fields, wrong value types, bad options, and non-Latin text', async () => {
    const base = { file: file('acroform.pdf'), flatten: false };
    for (const values of [
      { nope: 'x' },
      { agree: 'yes' },
      { color: 'Purple' },
      { full_name: 42 },
      { full_name: '王小明' },
    ]) {
      await expect(
        runOp('fillForm', { ...base, values: values as never }, noopCtx),
      ).rejects.toMatchObject({ code: 'invalid_input' });
    }
  });
});

/** A small opaque-on-transparent PNG standing in for a drawn signature. */
async function signaturePng(): Promise<Uint8Array> {
  const { createCanvas } = await import('@napi-rs/canvas');
  const c = createCanvas(300, 100);
  const g = c.getContext('2d');
  g.strokeStyle = '#1a237e';
  g.lineWidth = 6;
  g.beginPath();
  g.moveTo(10, 70);
  g.bezierCurveTo(80, 0, 120, 120, 290, 30);
  g.stroke();
  return new Uint8Array(await c.encode('png'));
}

describe('visual signature', () => {
  it('stamps the image where it was placed, on several pages', async () => {
    const image = await signaturePng();
    const out = await runOp(
      'sign',
      {
        file: file('simple.pdf'),
        image: image.buffer as ArrayBuffer,
        placements: [
          { page: 0, x: 0.55, y: 0.8, width: 0.35 },
          { page: 2, x: 0.1, y: 0.1, width: 0.2 },
        ],
      },
      noopCtx,
    );
    const bytes = out.files[0]!.bytes;
    expect(await expectValidPdf(bytes)).toBe(3);
    await expectMatchesGolden(await renderPage(bytes, 1), 'signature-bottom-right');
  });

  it('keeps the signature upright on rotated pages', async () => {
    const src = await PDFDocument.load(readFixture('simple.pdf'));
    src.getPage(0).setRotation(degrees(90));
    const image = await signaturePng();
    const out = await runOp(
      'sign',
      {
        file: bytesFile('r.pdf', await src.save()),
        image: image.buffer as ArrayBuffer,
        placements: [{ page: 0, x: 0.6, y: 0.7, width: 0.3 }],
      },
      noopCtx,
    );
    await expectMatchesGolden(await renderPage(out.files[0]!.bytes, 1), 'signature-rotated-90');
  });

  it('validates placements and the image', async () => {
    const image = (await signaturePng()).buffer as ArrayBuffer;
    const bad = [
      [],
      [{ page: 9, x: 0, y: 0, width: 0.2 }],
      [{ page: 0, x: 1.5, y: 0, width: 0.2 }],
      [{ page: 0, x: 0, y: 0, width: 0 }],
    ];
    for (const placements of bad) {
      await expect(
        runOp(
          'sign',
          { file: file('simple.pdf'), image, placements: placements as never },
          noopCtx,
        ),
      ).rejects.toMatchObject({ code: 'invalid_input' });
    }
    await expect(
      runOp(
        'sign',
        {
          file: file('simple.pdf'),
          image: fixtureBuffer('simple.pdf'),
          placements: [{ page: 0, x: 0, y: 0, width: 0.2 }],
        },
        noopCtx,
      ),
    ).rejects.toMatchObject({ code: 'invalid_input' });
  });
});

describe('password protect / unlock', () => {
  it('encrypts with AES-256 (R6) and the chosen permissions', async () => {
    const out = await runOp(
      'protect',
      {
        file: file('simple.pdf'),
        userPassword: 'open sesame',
        allowPrinting: true,
        allowCopying: false,
        allowEditing: false,
      },
      ctx,
    );
    const bytes = out.files[0]!.bytes;
    expect(out.files[0]!.name).toBe('simple-protected.pdf');
    const info = await qpdf(['--password=open sesame', '--show-encryption', '/in.pdf'], {
      'in.pdf': bytes,
    });
    expect(info.stdout).toContain('R = 6');
    expect(info.stdout).toContain('file encryption method: AESv3');
    expect(info.stdout).toContain('extract for any purpose: not allowed');
    expect(info.stdout).toContain('print high resolution: allowed');
    // pdf.js needs the password, and opens with it.
    await expect(openWithPdfjs(bytes).promise).rejects.toThrow();
    expect((await pageTexts(bytes, 'open sesame'))[0]).toContain('Hello from page 1');
  });

  it('round-trips: unlock with the right password gives back an unencrypted, valid PDF', async () => {
    const locked = (
      await runOp(
        'protect',
        {
          file: file('simple.pdf'),
          userPassword: '-starts-with-dash',
          allowPrinting: false,
          allowCopying: false,
          allowEditing: false,
        },
        ctx,
      )
    ).files[0]!.bytes;
    const out = await runOp(
      'unlock',
      { file: bytesFile('simple-protected.pdf', locked), password: '-starts-with-dash' },
      ctx,
    );
    expect(await expectValidPdf(out.files[0]!.bytes)).toBe(3);
    expect(out.files[0]!.name).toBe('simple-protected-unlocked.pdf');
  });

  it('unlocks the encrypted fixture and reports a wrong password clearly', async () => {
    const out = await runOp(
      'unlock',
      { file: file('encrypted.pdf'), password: ENCRYPTED_PASSWORD },
      ctx,
    );
    expect(await expectValidPdf(out.files[0]!.bytes)).toBe(3);
    await expect(
      runOp('unlock', { file: file('encrypted.pdf'), password: 'nope' }, ctx),
    ).rejects.toMatchObject({ code: 'wrong_password' });
  });

  it('refuses to double-encrypt, to unlock plain files, and garbage', async () => {
    const opts = { userPassword: 'x', allowPrinting: true, allowCopying: true, allowEditing: true };
    await expect(
      runOp('protect', { file: file('encrypted.pdf'), ...opts }, ctx),
    ).rejects.toMatchObject({ code: 'invalid_input' });
    await expect(
      runOp('unlock', { file: file('simple.pdf'), password: '' }, ctx),
    ).rejects.toMatchObject({ code: 'invalid_input' });
    await expect(
      runOp('protect', { file: file('not-a-pdf.pdf'), ...opts }, ctx),
    ).rejects.toMatchObject({ code: 'damaged' });
    await expect(
      runOp('protect', { file: file('simple.pdf'), ...opts, userPassword: '' }, ctx),
    ).rejects.toMatchObject({ code: 'invalid_input' });
    await expect(
      runOp('protect', { file: file('simple.pdf'), ...opts, userPassword: 'x'.repeat(200) }, ctx),
    ).rejects.toMatchObject({ code: 'invalid_input' });
    await expect(
      runOp('protect', { file: file('simple.pdf'), ...opts }, noopCtx),
    ).rejects.toMatchObject({ code: 'unsupported' });
  });
});
