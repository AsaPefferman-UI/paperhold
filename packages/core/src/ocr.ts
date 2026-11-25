// OCR engine: a thin, testable wrapper over the tesseract.js-core WASM build (injected, so core
// does not bundle it) and TSV parsing. No pdf-lib here: this module runs in the OCR worker.
import { PdfToolsError } from './errors.ts';

/** Languages we ship data for (Latin scripts: the text layer uses a WinAnsi font). */
export const OCR_LANGUAGES = {
  eng: 'English',
  deu: 'German',
  fra: 'French',
  spa: 'Spanish',
} as const;

export type OcrLanguage = keyof typeof OCR_LANGUAGES;

export interface OcrWord {
  text: string;
  /** Pixel box in the recognised image, origin top-left. */
  left: number;
  top: number;
  width: number;
  height: number;
  confidence: number;
}

/** The parts of the Emscripten module and TessBaseAPI we use. */
interface TessApi {
  Init(datapath: string, lang: string, oem: number): number;
  SetImageFile(exif: number, angle: number): number;
  Recognize(monitor: null): number;
  GetTSVText(page: number): string;
  End(): void;
}

export interface TessModule {
  FS: {
    mkdir(p: string): void;
    writeFile(p: string, d: Uint8Array): void;
    unlink(p: string): void;
  };
  TessBaseAPI: new () => TessApi;
}

export type TessFactory = (opts: { wasmBinary: Uint8Array | ArrayBuffer }) => Promise<TessModule>;

export interface OcrEngine {
  /** Recognise one encoded image (PNG/JPEG) and return its words. */
  recognize(image: Uint8Array): OcrWord[];
  end(): void;
}

const OEM_LSTM_ONLY = 1;

/** Load the engine with already-verified bytes: the WASM binary and uncompressed traineddata. */
export async function createOcrEngine(
  factory: TessFactory,
  wasmBinary: Uint8Array | ArrayBuffer,
  languages: { code: string; data: Uint8Array }[],
): Promise<OcrEngine> {
  if (languages.length === 0)
    throw new PdfToolsError('invalid_input', 'Choose at least one language.');
  const mod = await factory({ wasmBinary });
  mod.FS.mkdir('/tessdata');
  for (const { code, data } of languages) {
    if (!/^[a-z_]{3,10}$/.test(code)) throw new PdfToolsError('invalid_input');
    mod.FS.writeFile(`/tessdata/${code}.traineddata`, data);
  }
  const api = new mod.TessBaseAPI();
  if (api.Init('/tessdata', languages.map((l) => l.code).join('+'), OEM_LSTM_ONLY) !== 0) {
    throw new PdfToolsError('internal', 'The OCR engine could not start.');
  }
  return {
    recognize(image) {
      mod.FS.writeFile('/input', image);
      try {
        if (api.SetImageFile(1, 0) !== 0)
          throw new PdfToolsError('damaged', 'A page could not be read for OCR.');
        if (api.Recognize(null) !== 0)
          throw new PdfToolsError('internal', 'Text recognition failed on a page.');
        return parseTsv(api.GetTSVText(0));
      } finally {
        mod.FS.unlink('/input');
      }
    },
    end: () => api.End(),
  };
}

/** Tesseract TSV: level page block par line word left top width height conf text. Level 5 = word. */
export function parseTsv(tsv: string): OcrWord[] {
  const words: OcrWord[] = [];
  for (const line of tsv.split('\n')) {
    const cols = line.split('\t');
    if (cols[0] !== '5' || cols.length < 12) continue;
    const text = cols.slice(11).join('\t').trim();
    const [left, top, width, height, confidence] = cols.slice(6, 11).map(Number) as [
      number,
      number,
      number,
      number,
      number,
    ];
    if (!text || !(width > 0) || !(height > 0) || confidence < 0) continue;
    words.push({ text, left, top, width, height, confidence });
  }
  return words;
}
