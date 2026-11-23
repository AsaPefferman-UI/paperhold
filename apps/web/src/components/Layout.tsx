import { useEffect, useRef, type ReactNode } from 'react';
import { Link } from '../router.tsx';
import { SITE_NAME, TOOLS } from '../tools.ts';

/** Manila band with folder tabs; the current tool's tab joins the sheet below it. */
export function Layout({ path, children }: { path: string; children: ReactNode }) {
  const nav = useRef<HTMLElement>(null);
  // On narrow screens the tab strip scrolls; keep the current tool's tab in view.
  useEffect(() => {
    nav.current
      ?.querySelector('[aria-current="page"]')
      ?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [path]);
  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="band">
        <div className="band-inner">
          <Link className="wordmark" href="/">
            {SITE_NAME}
          </Link>
          <nav aria-label="Tools" ref={nav}>
            <ul className="tabs">
              {TOOLS.map((t) => (
                <li key={t.path}>
                  <Link
                    className="tab-link"
                    href={t.path}
                    aria-current={path === t.path ? 'page' : undefined}
                  >
                    {t.name}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </header>
      <main id="main" className="main" tabIndex={-1}>
        {children}
      </main>
      <footer className="footer">
        <p>
          Free and open source under AGPL-3.0. Every tool runs in your browser; your files are never
          uploaded.
        </p>
      </footer>
    </>
  );
}
