// Pixel codec over a 2D canvas. The same code runs on OffscreenCanvas in the worker or on a
// DOM canvas on the page (fallback for browsers without OffscreenCanvas in workers).
import { PdfToolsError, type CanvasCall, type SourceImage } from '@pdf-tools/core';

type AnyCanvas = OffscreenCanvas | HTMLCanvasElement;
type Ctx2D = OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D;

export interface CanvasEnv {
  create(width: number, height: number): AnyCanvas;
  toBlob(canvas: AnyCanvas, type: string, quality?: number): Promise<Blob>;
}

const ctx2d = (c: AnyCanvas) => c.getContext('2d') as Ctx2D;

async function bitmapFrom(bytes: Uint8Array, type: string): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(
      new Blob([bytes as Uint8Array<ArrayBuffer>], { type: type || 'application/octet-stream' }),
    );
  } catch {
    throw new PdfToolsError('unsupported', 'This browser cannot read this kind of image.');
  }
}

async function canvasFrom(env: CanvasEnv, src: SourceImage): Promise<AnyCanvas> {
  if (src.kind === 'jpeg') {
    const bitmap = await bitmapFrom(src.bytes, 'image/jpeg');
    const c = env.create(bitmap.width, bitmap.height);
    ctx2d(c).drawImage(bitmap, 0, 0);
    bitmap.close();
    return c;
  }
  const c = env.create(src.width, src.height);
  const ctx = ctx2d(c);
  const data = ctx.createImageData(src.width, src.height);
  const { pixels, channels } = src;
  if (channels === 4) data.data.set(pixels.subarray(0, data.data.length));
  else {
    for (let i = 0, j = 0; i < src.width * src.height; i++, j += channels) {
      const o = i * 4;
      data.data[o] = pixels[j]!;
      data.data[o + 1] = pixels[channels === 3 ? j + 1 : j]!;
      data.data[o + 2] = pixels[channels === 3 ? j + 2 : j]!;
      data.data[o + 3] = 255;
    }
  }
  ctx.putImageData(data, 0, 0);
  return c;
}

const bytesOf = async (blob: Blob) => new Uint8Array(await blob.arrayBuffer());

export async function runCanvasCall(env: CanvasEnv, call: CanvasCall): Promise<Uint8Array> {
  if (call.method === 'decodeToPng') {
    const bitmap = await bitmapFrom(call.bytes, call.mime);
    const c = env.create(bitmap.width, bitmap.height);
    ctx2d(c).drawImage(bitmap, 0, 0);
    bitmap.close();
    return bytesOf(await env.toBlob(c, 'image/png'));
  }
  const full = await canvasFrom(env, call.src);
  const c = env.create(call.width, call.height);
  const ctx = ctx2d(c);
  ctx.imageSmoothingQuality = 'high';
  // JPEG has no alpha: composite transparent pixels on white.
  ctx.fillStyle = 'white';
  ctx.fillRect(0, 0, call.width, call.height);
  ctx.drawImage(full, 0, 0, call.width, call.height);
  return bytesOf(await env.toBlob(c, 'image/jpeg', call.quality));
}

export const offscreenEnv: CanvasEnv = {
  create: (w, h) => new OffscreenCanvas(w, h),
  toBlob: (c, type, quality) => (c as OffscreenCanvas).convertToBlob({ type, quality }),
};

export const domEnv: CanvasEnv = {
  create: (w, h) => Object.assign(document.createElement('canvas'), { width: w, height: h }),
  toBlob: (c, type, quality) =>
    new Promise((resolve, reject) =>
      (c as HTMLCanvasElement).toBlob(
        (b) =>
          b
            ? resolve(b)
            : reject(new PdfToolsError('too_large', 'This image is too large for the browser.')),
        type,
        quality,
      ),
    ),
};
