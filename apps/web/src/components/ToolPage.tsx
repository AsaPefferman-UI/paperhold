import { useEffect, type ReactNode } from 'react';
import { SITE_NAME, type ToolMeta } from '../tools.ts';
import { ErrorBoundary } from './ErrorBoundary.tsx';
import { Icon } from './Icon.tsx';

export function ToolPage({ tool, children }: { tool: ToolMeta; children: ReactNode }) {
  useEffect(() => {
    document.title = `${tool.name} | ${SITE_NAME}`;
  }, [tool.name]);
  return (
    <div className="tool">
      <div className="tool-head">
        <h1>{tool.name}</h1>
        <p className="lede">{tool.description}</p>
        <p className="privacy-note">
          <Icon name="lock" size={18} /> Your files stay on this device. Nothing is uploaded.
        </p>
      </div>
      <div className="tool-body">
        <ErrorBoundary>{children}</ErrorBoundary>
      </div>
    </div>
  );
}
