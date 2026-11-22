import { useState, type DragEvent } from 'react';
import { moveItem } from '../lib/files.ts';
import { Icon } from './Icon.tsx';

export interface PageItem {
  /** Stable identity for React and drag state. */
  key: string;
  /** 0-based index in the source PDF. */
  index: number;
  /** Extra clockwise quarter turns chosen by the user. */
  rotate: 0 | 90 | 180 | 270;
}

interface Props {
  items: PageItem[];
  urls: (string | undefined)[];
  label: string;
  /** Without onChange the grid is read-only (used to preview pages). */
  onChange?: (items: PageItem[]) => void;
}

const turn = (r: number, by: number) => ((((r + by) % 360) + 360) % 360) as PageItem['rotate'];

/** Thumbnail grid of pages; when editable: drag or use buttons to move, rotate, or delete. */
export function PageGrid({ items, urls, label, onChange }: Props) {
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [announce, setAnnounce] = useState('');
  const editable = !!onChange;

  const update = (next: PageItem[], message: string) => {
    onChange?.(next);
    setAnnounce(message);
  };
  const move = (from: number, to: number) => {
    if (to < 0 || to >= items.length) return;
    update(
      moveItem(items, from, to),
      `Page ${items[from]!.index + 1} moved to position ${to + 1}.`,
    );
  };
  const rotate = (i: number, by: number) => {
    const item = items[i]!;
    const next = items.map((it, j) => (j === i ? { ...it, rotate: turn(it.rotate, by) } : it));
    update(next, `Page ${item.index + 1} rotated to ${turn(item.rotate, by)} degrees.`);
  };
  const remove = (i: number) =>
    update(
      items.filter((_, j) => j !== i),
      `Page ${items[i]!.index + 1} removed. ${items.length - 1} pages left.`,
    );
  const onDrop = (e: DragEvent, to: number) => {
    e.preventDefault();
    if (dragFrom !== null) move(dragFrom, to);
    setDragFrom(null);
  };

  return (
    <>
      <ol className="pages" aria-label={label}>
        {items.map((item, i) => {
          const url = urls[item.index];
          const name = `page ${item.index + 1}`;
          return (
            <li
              key={item.key}
              className="page-tile"
              draggable={editable}
              data-dragging={dragFrom === i || undefined}
              onDragStart={editable ? () => setDragFrom(i) : undefined}
              onDragOver={editable ? (e) => e.preventDefault() : undefined}
              onDrop={editable ? (e) => onDrop(e, i) : undefined}
              onDragEnd={() => setDragFrom(null)}
            >
              <div className="page-thumb">
                {url ? (
                  <img src={url} alt="" data-rotate={item.rotate || undefined} />
                ) : (
                  <span className="page-placeholder" aria-hidden="true" />
                )}
              </div>
              <span className="page-label">
                <span className="tab" data-tone={item.index % 4} aria-hidden="true">
                  {item.index + 1}
                </span>
                <span className="visually-hidden">
                  Page {item.index + 1}
                  {item.rotate ? `, rotated ${item.rotate} degrees` : ''}
                </span>
              </span>
              {editable && (
                <span className="page-actions">
                  <button
                    type="button"
                    className="icon-button"
                    aria-label={`Move ${name} earlier`}
                    aria-disabled={i === 0}
                    onClick={() => move(i, i - 1)}
                  >
                    <Icon name="left" />
                  </button>
                  <button
                    type="button"
                    className="icon-button"
                    aria-label={`Rotate ${name} left`}
                    onClick={() => rotate(i, -90)}
                  >
                    <Icon name="rotateLeft" />
                  </button>
                  <button
                    type="button"
                    className="icon-button"
                    aria-label={`Rotate ${name} right`}
                    onClick={() => rotate(i, 90)}
                  >
                    <Icon name="rotateRight" />
                  </button>
                  <button
                    type="button"
                    className="icon-button"
                    aria-label={`Delete ${name}`}
                    aria-disabled={items.length === 1}
                    onClick={() => items.length > 1 && remove(i)}
                  >
                    <Icon name="trash" />
                  </button>
                  <button
                    type="button"
                    className="icon-button"
                    aria-label={`Move ${name} later`}
                    aria-disabled={i === items.length - 1}
                    onClick={() => move(i, i + 1)}
                  >
                    <Icon name="right" />
                  </button>
                </span>
              )}
            </li>
          );
        })}
      </ol>
      <p className="visually-hidden" aria-live="polite">
        {announce}
      </p>
    </>
  );
}
