// Byte-level image helpers: format sniffing, JPEG EXIF orientation, PNG predictor undo.
import { unzlibSync } from 'fflate';
import { PdfToolsError } from './errors.ts';

export type ImageFormat = 'jpeg' | 'png' | 'heic' | 'webp' | 'gif' | 'bmp' | 'avif' | 'unknown';

const ascii = (b: Uint8Array, at: number, len: number) =>
  String.fromCharCode(...b.subarray(at, at + len));

/** Identify an image by its magic bytes, never by file name or MIME type. */
export function sniffImage(b: Uint8Array): ImageFormat {
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpeg';
  if (b[0] === 0x89 && ascii(b, 1, 3) === 'PNG') return 'png';
  if (ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 4) === 'WEBP') return 'webp';
  if (ascii(b, 0, 4) === 'GIF8') return 'gif';
  if (ascii(b, 0, 2) === 'BM') return 'bmp';
  if (ascii(b, 4, 4) === 'ftyp') {
    const brand = ascii(b, 8, 4);
    if (['avif', 'avis'].includes(brand)) return 'avif';
    if (['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'mif1', 'msf1'].includes(brand))
      return 'heic';
  }
  return 'unknown';
}

/**
 * EXIF orientation (1-8) of a JPEG, or 1 when absent. Phones store photos sideways and set this
 * flag; pdf-lib embeds JPEGs as-is, so we must apply it ourselves.
 */
export function jpegOrientation(b: Uint8Array): number {
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let i = 2;
  while (i + 4 <= b.length && b[i] === 0xff) {
    const marker = b[i + 1]!;
    const len = view.getUint16(i + 2);
    if (marker === 0xe1 && ascii(b, i + 4, 4) === 'Exif') {
      const tiff = i + 10;
      if (tiff + 8 > b.length) return 1;
      const little = ascii(b, tiff, 2) === 'II';
      const u16 = (o: number) => view.getUint16(o, little);
      const u32 = (o: number) => view.getUint32(o, little);
      const ifd = tiff + u32(tiff + 4);
      if (ifd + 2 > b.length) return 1;
      const count = u16(ifd);
      for (let e = 0; e < count; e++) {
        const entry = ifd + 2 + e * 12;
        if (entry + 12 > b.length) return 1;
        if (u16(entry) === 0x0112) {
          const v = u16(entry + 8);
          return v >= 1 && v <= 8 ? v : 1;
        }
      }
      return 1;
    }
    if (marker === 0xda) break; // start of scan: no more metadata
    i += 2 + len;
  }
  return 1;
}

/** Clockwise degrees needed to display a JPEG upright (mirrored variants treated as rotations). */
export function orientationDegrees(orientation: number): 0 | 90 | 180 | 270 {
  if (orientation === 3 || orientation === 4) return 180;
  if (orientation === 5 || orientation === 6) return 90;
  if (orientation === 7 || orientation === 8) return 270;
  return 0;
}

/** Undo PNG row predictors (PDF /Predictor >= 10). Returns tightly packed samples. */
export function unpredictPng(
  data: Uint8Array,
  width: number,
  height: number,
  bpp: number,
): Uint8Array {
  const stride = width * bpp;
  if (data.length < (stride + 1) * height) {
    throw new PdfToolsError('damaged', 'An image in this PDF is truncated.');
  }
  const out = new Uint8Array(stride * height);
  for (let y = 0; y < height; y++) {
    const filter = data[y * (stride + 1)]!;
    const src = y * (stride + 1) + 1;
    const row = y * stride;
    for (let x = 0; x < stride; x++) {
      const raw = data[src + x]!;
      const a = x >= bpp ? out[row + x - bpp]! : 0;
      const up = y > 0 ? out[row - stride + x]! : 0;
      const c = x >= bpp && y > 0 ? out[row - stride + x - bpp]! : 0;
      let v: number;
      switch (filter) {
        case 0:
          v = raw;
          break;
        case 1:
          v = raw + a;
          break;
        case 2:
          v = raw + up;
          break;
        case 3:
          v = raw + ((a + up) >> 1);
          break;
        case 4: {
          const p = a + up - c;
          const pa = Math.abs(p - a);
          const pb = Math.abs(p - up);
          const pc = Math.abs(p - c);
          v = raw + (pa <= pb && pa <= pc ? a : pb <= pc ? up : c);
          break;
        }
        default:
          throw new PdfToolsError('damaged', 'An image in this PDF uses an unknown filter.');
      }
      out[row + x] = v & 0xff;
    }
  }
  return out;
}

const PNG_CHANNELS: Record<number, number> = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };

/**
 * Check a PNG's structure and that its image data inflates to exactly the size its header
 * declares, before handing it to pdf-lib (whose decoder can spin on truncated data).
 */
export function validatePng(b: Uint8Array): void {
  const bad = (why: string) => new PdfToolsError('damaged', `This PNG image is damaged (${why}).`);
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
  if (sniffImage(b) !== 'png') throw bad('not a PNG');
  let o = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  let interlace = 0;
  const idat: Uint8Array[] = [];
  let ended = false;
  while (o + 12 <= b.length) {
    const len = view.getUint32(o);
    const type = ascii(b, o + 4, 4);
    if (o + 12 + len > b.length) throw bad('truncated chunk');
    const data = b.subarray(o + 8, o + 8 + len);
    if (type === 'IHDR') {
      width = view.getUint32(o + 8);
      height = view.getUint32(o + 12);
      bitDepth = b[o + 16]!;
      colorType = b[o + 17]!;
      interlace = b[o + 20]!;
    } else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') {
      ended = true;
      break;
    }
    o += 12 + len;
  }
  const channels = PNG_CHANNELS[colorType];
  if (
    !ended ||
    idat.length === 0 ||
    !width ||
    !height ||
    !channels ||
    ![1, 2, 4, 8, 16].includes(bitDepth)
  ) {
    throw bad('incomplete');
  }
  if (width * height > 100_000_000)
    throw new PdfToolsError('too_large', 'This image is too large to convert.');
  // Raw size: each row is a filter byte plus packed samples; Adam7 passes each have their own rows.
  const rowBytes = (w: number) => 1 + Math.ceil((w * channels * bitDepth) / 8);
  let expected = 0;
  if (interlace) {
    const passes = [
      [0, 0, 8, 8],
      [4, 0, 8, 8],
      [0, 4, 4, 8],
      [2, 0, 4, 4],
      [0, 2, 2, 4],
      [1, 0, 2, 2],
      [0, 1, 1, 2],
    ] as const;
    for (const [x0, y0, dx, dy] of passes) {
      const pw = Math.ceil((width - x0) / dx);
      const ph = Math.ceil((height - y0) / dy);
      if (pw > 0 && ph > 0) expected += rowBytes(pw) * ph;
    }
  } else expected = rowBytes(width) * height;
  const all = new Uint8Array(idat.reduce((n, d) => n + d.length, 0));
  let p = 0;
  for (const d of idat) {
    all.set(d, p);
    p += d.length;
  }
  let raw: Uint8Array;
  try {
    raw = unzlibSync(all, { out: new Uint8Array(expected) });
  } catch {
    throw bad('corrupt image data');
  }
  if (raw.length !== expected) throw bad('image data does not match its size');
}
