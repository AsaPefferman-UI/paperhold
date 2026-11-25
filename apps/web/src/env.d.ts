/** Versioned base path of self-hosted pdf.js data files, e.g. "/pdfjs-6.5.438/". */
declare const __PDFJS_BASE__: string;

/** Self-hosted OCR binaries and the SHA-256 each must match (computed at build time). */
declare const __OCR_MANIFEST__: {
  base: string;
  files: Record<string, { sha256: string; bytes: number }>;
};

// tesseract.js-core ships Emscripten factories without types; core's TessFactory describes them.
declare module 'tesseract.js-core/tesseract-core-simd-lstm.js' {
  const factory: unknown;
  export default factory;
}
declare module 'tesseract.js-core/tesseract-core-lstm.js' {
  const factory: unknown;
  export default factory;
}
