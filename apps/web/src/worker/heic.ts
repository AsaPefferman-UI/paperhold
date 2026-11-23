import { PdfToolsError } from '@pdf-tools/core';

/** The slice of libheif-js we use. */
interface HeifImage {
  get_width(): number;
  get_height(): number;
  display(
    target: { data: Uint8ClampedArray; width: number; height: number },
    done: (result: { data: Uint8ClampedArray; width: number; height: number } | null) => void,
  ): void;
  free?(): void;
}

export type LibheifFactory = (opts: { wasmBinary: ArrayBuffer }) => {
  HeifDecoder: new () => { decode(bytes: Uint8Array): HeifImage[] };
};

/** Largest image we will decode: 100 megapixels (a 400 MB RGBA buffer). */
const MAX_PIXELS = 100_000_000;

/** Decode the primary image of a HEIC/HEIF/AVIF file to RGBA. */
export async function decodeHeic(
  bytes: Uint8Array,
  libheif: ReturnType<LibheifFactory>,
): Promise<{ width: number; height: number; data: Uint8ClampedArray<ArrayBuffer> }> {
  let images: HeifImage[];
  try {
    images = new libheif.HeifDecoder().decode(bytes);
  } catch {
    images = [];
  }
  const image = images[0];
  if (!image)
    throw new PdfToolsError('damaged', 'This HEIC image is damaged or uses an unsupported codec.');
  const width = image.get_width();
  const height = image.get_height();
  if (!width || !height || width * height > MAX_PIXELS) {
    throw new PdfToolsError('too_large', 'This image is too large to convert in the browser.');
  }
  const data = new Uint8ClampedArray(width * height * 4);
  const result = await new Promise<boolean>((resolve) =>
    image.display({ data, width, height }, (out) => resolve(out !== null)),
  );
  for (const img of images) img.free?.();
  if (!result) throw new PdfToolsError('damaged', 'This HEIC image could not be decoded.');
  return { width, height, data };
}
