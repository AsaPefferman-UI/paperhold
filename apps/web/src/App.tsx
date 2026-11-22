import { lazy, Suspense, type ReactNode } from 'react';
import { Layout } from './components/Layout.tsx';
import Home from './pages/Home.tsx';
import NotFound from './pages/NotFound.tsx';
import { usePath } from './router.tsx';
import { TOOLS, type ToolMeta } from './tools.ts';

// Each tool is its own chunk so the landing route stays small.
const Merge = lazy(() => import('./tools/Merge.tsx'));

const ROUTES: Record<string, (tool: ToolMeta) => ReactNode> = {
  '/merge': (tool) => <Merge tool={tool} />,
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
