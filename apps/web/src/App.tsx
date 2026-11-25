import { lazy, Suspense } from 'react';
import { Layout } from './components/Layout.tsx';
import Home from './pages/Home.tsx';
import NotFound from './pages/NotFound.tsx';
import { usePath } from './router.tsx';
import { ROUTES } from './routes.tsx';
import { TOOLS } from './tools.ts';

const Privacy = lazy(() => import('./pages/Privacy.tsx'));

export function App() {
  const path = usePath().replace(/\/+$/, '') || '/';
  const tool = TOOLS.find((t) => t.path === path);
  const render = tool && ROUTES[tool.path];
  return (
    <Layout path={path}>
      {path === '/' ? (
        <Home />
      ) : path === '/privacy' ? (
        <Suspense fallback={<p className="loading">Loading…</p>}>
          <Privacy />
        </Suspense>
      ) : render && tool ? (
        <Suspense fallback={<p className="loading">Loading tool…</p>}>{render(tool)}</Suspense>
      ) : (
        <NotFound />
      )}
    </Layout>
  );
}
