import { formatBytes } from '@pdf-tools/core';
import type { ReactNode } from 'react';
import type { OperationState } from '../lib/useOperation.ts';
import { Icon } from './Icon.tsx';
import './RunPanel.css';

interface Props {
  state: OperationState;
  /** Verb in progress, e.g. "Merging". */
  busyLabel: string;
  onCancel: () => void;
  onReset: () => void;
  /** The primary action, shown when idle or after an error. */
  children: ReactNode;
}

/** The step after options: run, watch progress, cancel, then download or recover. */
export function RunPanel({ state, busyLabel, onCancel, onReset, children }: Props) {
  if (state.status === 'running') {
    const pct = state.progress === null ? null : Math.round(state.progress * 100);
    return (
      <div className="run stack" role="status">
        <div className="run-line">
          <span>
            {busyLabel}
            {pct === null ? '…' : ` ${pct}%`}
          </span>
          <button type="button" className="button button-quiet" onClick={onCancel}>
            Cancel
          </button>
        </div>
        <progress
          className="progress"
          max={1}
          {...(state.progress === null ? {} : { value: state.progress })}
        >
          {pct === null ? '' : `${pct}%`}
        </progress>
      </div>
    );
  }
  if (state.status === 'done') {
    return (
      <div className="run run-done stack" role="status">
        <p className="stamp stamp-done">
          <Icon name="check" /> Done on this device. Nothing was uploaded.
        </p>
        <ul className="downloads stack">
          {state.files.map((f) => (
            <li key={f.url} className="cluster">
              <a className="button button-primary" href={f.url} download={f.name}>
                <Icon name="download" /> Download {f.name}
              </a>
              <span className="sheet-meta">{formatBytes(f.size)}</span>
            </li>
          ))}
        </ul>
        <button type="button" className="button button-quiet" onClick={onReset}>
          Start over
        </button>
      </div>
    );
  }
  return (
    <div className="run stack">
      {state.status === 'error' && (
        <p className="stamp stamp-error" role="alert">
          <Icon name="alert" /> {state.error.message}
        </p>
      )}
      {children}
    </div>
  );
}
