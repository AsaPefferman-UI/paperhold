# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- M1 foundation: Vite + React app, typed worker protocol and worker pool with timeouts and
  cancel, strict CSP and security headers, synthetic fixture corpus, CI pipeline, self-host
  Docker image.
- Merge PDFs tool (drag or keyboard to reorder).
- M2 page tools: Split (extract, per range, every N pages; zip for many files), Organize
  pages (thumbnail grid: reorder, rotate, delete), Page numbers, Watermark.
- Self-hosted pdf.js data files (fonts, CMaps, image decoders) under a versioned path.
- M3 convert tools: Images to PDF (JPG, PNG, HEIC/AVIF via libheif WASM, WebP/GIF/BMP via the
  browser; EXIF rotation honoured), PDF to images (PNG/JPG, zip), Compress (three presets:
  image re-encoding plus qpdf object streams).
- Canvas fallback for browsers without OffscreenCanvas in workers.
- M4: Fill form (all AcroForm field types, optional flatten), Sign (visual signature: draw,
  type or upload; drag or keyboard placement; opt-in saved signature with Forget), Protect and
  Unlock (qpdf, AES-256 only).
- M5: OCR (make searchable): tesseract.js-core WASM in a dedicated worker, self-hosted engine and
  language data (English, German, French, Spanish) checked against SHA-256 hashes compiled into
  the app, invisible text layer, progress with time left, cancel.
