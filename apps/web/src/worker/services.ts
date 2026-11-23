/// <reference lib="webworker" />
// Browser implementations of core's platform services, used inside the ops worker.
// Every WASM binary is a same-origin asset emitted by Vite (no CDN, covered by the CSP).
import { sniffImage, type CanvasCall, type Services } from '@pdf-tools/core';
import qpdfFactory from '@neslinesli93/qpdf-wasm';
import qpdfWasmUrl from '@neslinesli93/qpdf-wasm/dist/qpdf.wasm?url';
import heifWasmUrl from 'libheif-js/libheif-wasm/libheif.wasm?url';
import { offscreenEnv, runCanvasCall } from '../lib/canvas-codec.ts';
import { decodeHeic, type LibheifFactory } from './heic.ts';

let libheif: Promise<ReturnType<LibheifFactory>> | undefined;

async function loadLibheif() {
  libheif ??= (async () => {
    const [{ default: factory }, wasm] = await Promise.all([
      import('libheif-js/libheif-wasm/libheif.js') as unknown as Promise<{
        default: LibheifFactory;
      }>,
      fetch(heifWasmUrl).then((r) => r.arrayBuffer()),
    ]);
    return factory({ wasmBinary: wasm });
  })();
  return libheif;
}

/**
 * @param askPage runs a canvas call on the page; used when this worker has no OffscreenCanvas.
 */
export function browserServices(askPage: (call: CanvasCall) => Promise<Uint8Array>): Services {
  const canvas = (call: CanvasCall) =>
    typeof OffscreenCanvas === 'undefined' ? askPage(call) : runCanvasCall(offscreenEnv, call);
  return {
    async decodeImage(bytes, mime) {
      const format = sniffImage(bytes);
      if (format === 'heic' || format === 'avif') {
        const { width, height, data } = await decodeHeic(bytes, await loadLibheif());
        const src = {
          kind: 'raw' as const,
          width,
          height,
          channels: 4 as const,
          pixels: new Uint8Array(data.buffer),
        };
        return {
          bytes: await canvas({ method: 'encodeJpeg', src, width, height, quality: 0.92 }),
          format: 'jpeg',
        };
      }
      return { bytes: await canvas({ method: 'decodeToPng', bytes, mime }), format: 'png' };
    },
    encodeJpeg: (src, width, height, quality) =>
      canvas({ method: 'encodeJpeg', src, width, height, quality }),
    qpdf: {
      factory: qpdfFactory as unknown as NonNullable<Services['qpdf']>['factory'],
      locateFile: () => qpdfWasmUrl,
    },
  };
}
