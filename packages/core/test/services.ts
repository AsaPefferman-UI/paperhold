// Node implementations of the platform services (the browser worker uses OffscreenCanvas).
import { createCanvas, loadImage } from '@napi-rs/canvas';
import type { Services, SourceImage } from '../src/protocol.ts';
import { nodeQpdf } from './qpdf.ts';

async function toCanvas(src: SourceImage) {
  if (src.kind === 'jpeg') {
    const img = await loadImage(Buffer.from(src.bytes));
    const c = createCanvas(img.width, img.height);
    c.getContext('2d').drawImage(img, 0, 0);
    return c;
  }
  const c = createCanvas(src.width, src.height);
  const ctx = c.getContext('2d');
  const data = ctx.createImageData(src.width, src.height);
  for (let i = 0, j = 0; i < src.width * src.height; i++, j += src.channels) {
    data.data[i * 4] = src.pixels[j]!;
    data.data[i * 4 + 1] = src.pixels[src.channels === 3 ? j + 1 : j]!;
    data.data[i * 4 + 2] = src.pixels[src.channels === 3 ? j + 2 : j]!;
    data.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(data, 0, 0);
  return c;
}

export const nodeServices: Services = {
  async decodeImage(bytes) {
    const img = await loadImage(Buffer.from(bytes));
    const c = createCanvas(img.width, img.height);
    c.getContext('2d').drawImage(img, 0, 0);
    return { bytes: new Uint8Array(await c.encode('png')), format: 'png' };
  },
  async encodeJpeg(src, width, height, quality) {
    const full = await toCanvas(src);
    const c = createCanvas(width, height);
    c.getContext('2d').drawImage(full, 0, 0, width, height);
    return new Uint8Array(await c.encode('jpeg', Math.round(quality * 100)));
  },
  qpdf: { factory: nodeQpdf },
};
