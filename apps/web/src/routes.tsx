import { lazy, type ReactNode } from 'react';
import type { ToolMeta } from './tools.ts';

// Each tool is its own chunk so the landing route stays small.
const Merge = lazy(() => import('./tools/Merge.tsx'));
const Split = lazy(() => import('./tools/Split.tsx'));
const Organize = lazy(() => import('./tools/Organize.tsx'));
const PageNumbers = lazy(() => import('./tools/PageNumbers.tsx'));
const Watermark = lazy(() => import('./tools/Watermark.tsx'));
const Compress = lazy(() => import('./tools/Compress.tsx'));
const ImagesToPdf = lazy(() => import('./tools/ImagesToPdf.tsx'));
const PdfToImages = lazy(() => import('./tools/PdfToImages.tsx'));
const FillForm = lazy(() => import('./tools/FillForm.tsx'));
const Sign = lazy(() => import('./tools/Sign.tsx'));
const Protect = lazy(() => import('./tools/Protect.tsx'));
const Unlock = lazy(() => import('./tools/Unlock.tsx'));
const Ocr = lazy(() => import('./tools/Ocr.tsx'));

// Every entry in TOOLS needs a route here; routes.test.ts fails if one is missing.
export const ROUTES: Record<string, (tool: ToolMeta) => ReactNode> = {
  '/merge': (tool) => <Merge tool={tool} />,
  '/split': (tool) => <Split tool={tool} />,
  '/organize': (tool) => <Organize tool={tool} />,
  '/page-numbers': (tool) => <PageNumbers tool={tool} />,
  '/watermark': (tool) => <Watermark tool={tool} />,
  '/compress': (tool) => <Compress tool={tool} />,
  '/images-to-pdf': (tool) => <ImagesToPdf tool={tool} />,
  '/pdf-to-images': (tool) => <PdfToImages tool={tool} />,
  '/fill-form': (tool) => <FillForm tool={tool} />,
  '/sign': (tool) => <Sign tool={tool} />,
  '/protect': (tool) => <Protect tool={tool} />,
  '/unlock': (tool) => <Unlock tool={tool} />,
  '/ocr': (tool) => <Ocr tool={tool} />,
};
