import type { NumberPosition } from '@pdf-tools/core';
import { useState } from 'react';
import { RunPanel } from '../components/RunPanel.tsx';
import { SingleFile } from '../components/SingleFile.tsx';
import { ToolPage } from '../components/ToolPage.tsx';
import { isPdf, type PickedFile } from '../lib/files.ts';
import { useOperation } from '../lib/useOperation.ts';
import type { ToolMeta } from '../tools.ts';

const POSITIONS: { value: NumberPosition; label: string }[] = [
  { value: 'bottom-center', label: 'Bottom centre' },
  { value: 'bottom-right', label: 'Bottom right' },
  { value: 'bottom-left', label: 'Bottom left' },
  { value: 'top-center', label: 'Top centre' },
  { value: 'top-right', label: 'Top right' },
  { value: 'top-left', label: 'Top left' },
];

const FORMATS = [
  { value: '{n}', label: '1' },
  { value: 'Page {n}', label: 'Page 1' },
  { value: '{n} of {total}', label: '1 of 10' },
  { value: 'Page {n} of {total}', label: 'Page 1 of 10' },
];

export default function PageNumbers({ tool }: { tool: ToolMeta }) {
  const [file, setFile] = useState<PickedFile | null>(null);
  const [position, setPosition] = useState<NumberPosition>('bottom-center');
  const [format, setFormat] = useState('{n}');
  const [startAt, setStartAt] = useState(1);
  const [fontSize, setFontSize] = useState(11);
  const [pages, setPages] = useState('');
  const { state, run, cancel, reset } = useOperation('pageNumbers');

  const go = () =>
    run(async () => {
      const bytes = await file!.file.arrayBuffer();
      return {
        args: {
          file: { name: file!.file.name, bytes },
          position,
          format,
          startAt,
          fontSize,
          pages,
        },
        transfer: [bytes],
      };
    });

  return (
    <ToolPage tool={tool}>
      <section className="sheet" aria-labelledby="step-file">
        <h2 id="step-file">1. Choose a PDF</h2>
        <SingleFile
          accept={tool.accept}
          isAccepted={isPdf}
          label="Choose a PDF or drop it here"
          hint="One file at a time."
          file={file}
          onChange={(f) => {
            setFile(f);
            reset();
          }}
        />
      </section>
      <section className="sheet" aria-labelledby="step-options">
        <h2 id="step-options">2. Numbering</h2>
        <div className="fields">
          <label className="field">
            <span>Position</span>
            <select
              value={position}
              onChange={(e) => setPosition(e.target.value as NumberPosition)}
            >
              {POSITIONS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Style</span>
            <select value={format} onChange={(e) => setFormat(e.target.value)}>
              {FORMATS.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>First number</span>
            <input
              type="number"
              min={0}
              value={startAt}
              onChange={(e) => setStartAt(Number(e.target.value))}
            />
          </label>
          <label className="field">
            <span>Text size (pt)</span>
            <input
              type="number"
              min={6}
              max={72}
              value={fontSize}
              onChange={(e) => setFontSize(Number(e.target.value))}
            />
          </label>
          <label className="field field-wide">
            <span>Only these pages (optional)</span>
            <input
              type="text"
              inputMode="numeric"
              placeholder="All pages, or e.g. 2-"
              value={pages}
              onChange={(e) => setPages(e.target.value)}
            />
          </label>
        </div>
        <RunPanel state={state} busyLabel="Numbering" onCancel={cancel} onReset={reset}>
          <button
            type="button"
            className="button button-primary button-wide"
            disabled={!file}
            onClick={go}
          >
            Add page numbers
          </button>
        </RunPanel>
      </section>
    </ToolPage>
  );
}
