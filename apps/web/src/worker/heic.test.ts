import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { decodeHeic, type LibheifFactory } from './heic.ts';

const require = createRequire(import.meta.url);

describe('decodeHeic', () => {
  it('loads the self-hosted libheif build and rejects non-HEIC bytes with a typed error', async () => {
    const factory = require('libheif-js/libheif-wasm/libheif.js') as LibheifFactory;
    const wasm = readFileSync(require.resolve('libheif-js/libheif-wasm/libheif.wasm'));
    const libheif = factory({
      wasmBinary: wasm.buffer.slice(
        wasm.byteOffset,
        wasm.byteOffset + wasm.byteLength,
      ) as ArrayBuffer,
    });
    const fake = new Uint8Array([0, 0, 0, 24, ...new TextEncoder().encode('ftypheic'), 0, 0, 0, 0]);
    await expect(decodeHeic(fake, libheif)).rejects.toMatchObject({ code: 'damaged' });
  });
});
