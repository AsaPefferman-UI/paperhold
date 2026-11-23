import type { PageSizeChoice } from '@pdf-tools/core';
import { useState } from 'react';
import { FileDrop } from '../components/FileDrop.tsx';
import { FileList } from '../components/FileList.tsx';
import { RunPanel } from '../components/RunPanel.tsx';
import { ToolPage } from '../components/ToolPage.tsx';
import { isImage, pickFiles, type PickedFile } from '../lib/files.ts';
import { useOperation } from '../lib/useOperation.ts';
import type { ToolMeta } from '../tools.ts';

const SIZES: { value: PageSizeChoice; label: string }[] = [
  { value: 'fit', label: 'Same as each image' },
  { value: 'a4', label: 'A4' },
  { value: 'letter', label: 'US Letter' },
];

export default function ImagesToPdf({ tool }: { tool: ToolMeta }) {
  const [files, setFiles] = useState<PickedFile[]>([]);
  const [refused, setRefused] = useState<string[]>([]);
  const [pageSize, setPageSize] = useState<PageSizeChoice>('fit');
  const [margin, setMargin] = useState(true);
  const { state, run, cancel, reset } = useOperation('imagesToPdf');

  const add = (list: File[]) => {
    const result = pickFiles(list, isImage);
    setFiles((prev) => [...prev, ...result.picked]);
    setRefused(result.refused);
    if (state.status === 'done' || state.status === 'error') reset();
  };

  const go = () =>
    run(async () => {
      const buffers = await Promise.all(files.map((f) => f.file.arrayBuffer()));
      return {
        args: {
          files: files.map((f, i) => ({
            name: f.file.name,
            bytes: buffers[i]!,
            mime: f.file.type,
          })),
          pageSize,
          margin: margin ? 36 : 0,
        },
        transfer: buffers,
      };
    });

  return (
    <ToolPage tool={tool}>
      <section className="sheet" aria-labelledby="step-files">
        <h2 id="step-files">1. Add images</h2>
        <FileDrop
          accept={tool.accept}
          label="Choose images or drop them here"
          hint="JPG, PNG, HEIC (iPhone), WebP, GIF or BMP. Each image becomes a page."
          onFiles={add}
        />
        {refused.length > 0 && (
          <ul className="refused" role="alert">
            {refused.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        )}
        {files.length > 0 && (
          <FileList
            files={files}
            label="Images, in page order"
            onChange={(next) => {
              setFiles(next);
              if (state.status !== 'running') reset();
            }}
          />
        )}
      </section>
      <section className="sheet" aria-labelledby="step-options">
        <h2 id="step-options">2. Layout</h2>
        <div className="fields">
          <label className="field">
            <span>Page size</span>
            <select
              value={pageSize}
              onChange={(e) => setPageSize(e.target.value as PageSizeChoice)}
            >
              {SIZES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
          {pageSize !== 'fit' && (
            <label className="check">
              <input
                type="checkbox"
                checked={margin}
                onChange={(e) => setMargin(e.target.checked)}
              />
              <span>Half-inch margin</span>
            </label>
          )}
        </div>
        <RunPanel state={state} busyLabel="Converting" onCancel={cancel} onReset={reset}>
          <button
            type="button"
            className="button button-primary button-wide"
            disabled={files.length === 0}
            onClick={go}
          >
            Convert{' '}
            {files.length > 0
              ? `${files.length} ${files.length === 1 ? 'image' : 'images'}`
              : 'images'}{' '}
            to PDF
          </button>
        </RunPanel>
      </section>
    </ToolPage>
  );
}
