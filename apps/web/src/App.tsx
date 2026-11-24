import { lazy, Suspense, type ReactNode } from 'react';
import { Layout } from './components/Layout.tsx';
import Home from './pages/Home.tsx';
import NotFound from './pages/NotFound.tsx';
import { usePath } from './router.tsx';
import { TOOLS, type ToolMeta } from './tools.ts';

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

const ROUTES: Record<string, (tool: ToolMeta) => ReactNode> = {
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
};

export function App() {
  const path = usePath().replace(/\/+$/, '') || '/';
  const tool = TOOLS.find((t) => t.path === path);
  const render = tool && ROUTES[tool.path];
  return (
    <Layout path={path}>
      {path === '/' ? (
        <Home />
      ) : render && tool ? (
        <Suspense fallback={<p className="loading">Loading tool…</p>}>{render(tool)}</Suspense>
      ) : (
        <NotFound />
      )}
    </Layout>
  );
}
