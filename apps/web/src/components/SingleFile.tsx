import { formatBytes } from '@pdf-tools/core';
import { useState } from 'react';
import { pickFiles, type PickedFile } from '../lib/files.ts';
import { FileDrop } from './FileDrop.tsx';
import { Icon } from './Icon.tsx';
import './FileList.css';

interface Props {
  accept: string;
  isAccepted: (f: File) => boolean;
  label: string;
  hint: string;
  file: PickedFile | null;
  onChange: (file: PickedFile | null) => void;
}

/** Pick exactly one file; once picked, show it as a tabbed sheet with a way to replace it. */
export function SingleFile({ accept, isAccepted, label, hint, file, onChange }: Props) {
  const [refused, setRefused] = useState<string[]>([]);
  const add = (list: File[]) => {
    const result = pickFiles(list.slice(0, 1), isAccepted);
    setRefused(result.refused);
    if (result.picked[0]) onChange(result.picked[0]);
  };
  return (
    <>
      {file ? (
        <div className="sheet-row single-file">
          <span className="tab" data-tone="2" aria-hidden="true">
            1
          </span>
          <span className="sheet-name">{file.file.name}</span>
          <span className="sheet-meta">
            {formatBytes(file.file.size)}
            {file.size === 'warn' && <span className="note">Large file, may be slow</span>}
          </span>
          <span className="row-actions">
            <button
              type="button"
              className="icon-button"
              aria-label={`Remove ${file.file.name}`}
              onClick={() => onChange(null)}
            >
              <Icon name="remove" />
            </button>
          </span>
        </div>
      ) : (
        <FileDrop accept={accept} multiple={false} label={label} hint={hint} onFiles={add} />
      )}
      {refused.length > 0 && (
        <ul className="refused" role="alert">
          {refused.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      )}
    </>
  );
}
