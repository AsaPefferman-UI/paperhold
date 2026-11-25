import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { runOp } from '../src/dispatch.ts';
import { noopCtx } from './helpers.ts';
import { nodeServices } from './services.ts';

const read = (name: string) =>
  new Uint8Array(readFileSync(new URL(`../fixtures/regressions/${name}`, import.meta.url)));
const ctx = { ...noopCtx, services: nodeServices };

describe('fuzz-found hangs stay fixed', () => {
  it(
    'a cross-reference stream with absurd field widths is rejected quickly',
    { timeout: 5000 },
    async () => {
      const bytes = read('xref-huge-field-width.pdf');
      for (const op of ['split', 'merge', 'compress', 'protect'] as const) {
        const file = { name: 'x.pdf', bytes: bytes.slice().buffer as ArrayBuffer };
        const args =
          op === 'split'
            ? { file, mode: { kind: 'every', every: 1 } }
            : op === 'merge'
              ? { files: [file, file] }
              : op === 'compress'
                ? { file, preset: 'balanced' }
                : {
                    file,
                    userPassword: 'x',
                    allowPrinting: true,
                    allowCopying: true,
                    allowEditing: true,
                  };
        await expect(runOp(op, args as never, ctx)).rejects.toMatchObject({ code: 'damaged' });
      }
    },
  );

  it('a PNG with truncated image data is rejected quickly', { timeout: 5000 }, async () => {
    const bytes = read('png-truncated-idat.png');
    await expect(
      runOp(
        'imagesToPdf',
        {
          files: [{ name: 't.png', bytes: bytes.buffer as ArrayBuffer, mime: 'image/png' }],
          pageSize: 'fit',
          margin: 0,
        },
        ctx,
      ),
    ).rejects.toMatchObject({ code: 'damaged', message: expect.stringContaining('t.png') });
  });
});
