import { Component, type ReactNode } from 'react';

interface State {
  failed: boolean;
}

/**
 * One per tool: a render bug shows a recoverable message, never a blank page.
 * Errors are deliberately not reported anywhere: they may contain file names.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  override state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  override render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="sheet" role="alert">
        <h2>This tool hit an unexpected problem</h2>
        <p>Your files were not sent anywhere. Reload the page to start again.</p>
        <button
          type="button"
          className="button button-primary"
          onClick={() => window.location.reload()}
        >
          Reload
        </button>
      </div>
    );
  }
}
