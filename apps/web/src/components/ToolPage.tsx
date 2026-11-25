import { useEffect, type ReactNode } from 'react';
import { SITE } from '../site.ts';
import type { ToolMeta } from '../tools.ts';
import { ErrorBoundary } from './ErrorBoundary.tsx';
import { Icon } from './Icon.tsx';
import './ToolPage.css';

export function ToolPage({
  tool,
  notice,
  children,
}: {
  tool: ToolMeta;
  /** An always-visible caveat shown under the title (e.g. what a visual signature is not). */
  notice?: ReactNode;
  children: ReactNode;
}) {
  useEffect(() => {
    document.title = `${tool.name} | ${SITE.name}`;
  }, [tool.name]);
  return (
    <div className="tool">
      <div className="tool-head">
        <h1>{tool.name}</h1>
        <p className="lede">{tool.description}</p>
        <p className="privacy-note">
          <Icon name="lock" size={18} /> Your files stay on this device. Nothing is uploaded.
        </p>
        {notice && (
          <p className="notice" role="note">
            <Icon name="alert" size={18} /> {notice}
          </p>
        )}
      </div>
      <div className="tool-body">
        <ErrorBoundary>{children}</ErrorBoundary>
      </div>
    </div>
  );
}
