import { formatBytes } from '@pdf-tools/core';
import { useState, type DragEvent } from 'react';
import { moveItem, type PickedFile } from '../lib/files.ts';
import { Icon } from './Icon.tsx';

interface Props {
  files: PickedFile[];
  label: string;
  onChange: (files: PickedFile[]) => void;
}

/** Stable colour per file (not per position) so a file is recognisable as it moves. */
const tone = (id: string) => Number(id.replace(/\D/g, '')) % 4;

/** Ordered list of files as tabbed sheets: drag to reorder, or use the buttons (keyboard). */
export function FileList({ files, label, onChange }: Props) {
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [announce, setAnnounce] = useState('');

  const move = (from: number, to: number) => {
    if (to < 0 || to >= files.length) return;
    onChange(moveItem(files, from, to));
    setAnnounce(`${files[from]?.file.name} moved to position ${to + 1} of ${files.length}.`);
  };
  const remove = (i: number) => {
    setAnnounce(`${files[i]?.file.name} removed.`);
    onChange(files.filter((_, j) => j !== i));
  };
  const onDrop = (e: DragEvent, to: number) => {
    e.preventDefault();
    if (dragFrom !== null) move(dragFrom, to);
    setDragFrom(null);
  };

  return (
    <>
      <ol className="sheets" aria-label={label}>
        {files.map((f, i) => (
          <li
            key={f.id}
            className="sheet-row"
            draggable
            data-dragging={dragFrom === i || undefined}
            onDragStart={(e) => {
              setDragFrom(i);
              e.dataTransfer.effectAllowed = 'move';
            }}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => onDrop(e, i)}
            onDragEnd={() => setDragFrom(null)}
          >
            <span className="tab" data-tone={tone(f.id)} aria-hidden="true">
              {i + 1}
            </span>
            <span className="sheet-name">{f.file.name}</span>
            <span className="sheet-meta">
              {formatBytes(f.file.size)}
              {f.size === 'warn' && <span className="note">Large file, may be slow</span>}
            </span>
            <span className="row-actions">
              <button
                type="button"
                className="icon-button"
                aria-label={`Move ${f.file.name} up`}
                aria-disabled={i === 0}
                onClick={() => move(i, i - 1)}
              >
                <Icon name="up" />
              </button>
              <button
                type="button"
                className="icon-button"
                aria-label={`Move ${f.file.name} down`}
                aria-disabled={i === files.length - 1}
                onClick={() => move(i, i + 1)}
              >
                <Icon name="down" />
              </button>
              <button
                type="button"
                className="icon-button"
                aria-label={`Remove ${f.file.name}`}
                onClick={() => remove(i)}
              >
                <Icon name="remove" />
              </button>
            </span>
          </li>
        ))}
      </ol>
      <p className="visually-hidden" aria-live="polite">
        {announce}
      </p>
    </>
  );
}
