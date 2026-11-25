import type { SplitMode } from '@pdf-tools/core';
import { useState } from 'react';
import { PageGrid } from '../components/PageGrid.tsx';
import { RunPanel } from '../components/RunPanel.tsx';
import { SingleFile } from '../components/SingleFile.tsx';
import { ToolPage } from '../components/ToolPage.tsx';
import { isPdf, type PickedFile } from '../lib/files.ts';
import { useOperation } from '../lib/useOperation.ts';
import { useThumbnails } from '../lib/useThumbnails.ts';
import type { ToolMeta } from '../tools.ts';
import './Split.css';

type Kind = SplitMode['kind'];

const KINDS: { kind: Kind; label: string; hint: string }[] = [
  { kind: 'extract', label: 'Extract pages into one PDF', hint: 'For example 1-3, 7, 10-' },
  {
    kind: 'ranges',
    label: 'Split into one PDF per range',
    hint: 'Each comma-separated range becomes a file',
  },
  { kind: 'every', label: 'Split every N pages', hint: 'Consecutive files of the same length' },
];

export default function Split({ tool }: { tool: ToolMeta }) {
  const [file, setFile] = useState<PickedFile | null>(null);
  const [kind, setKind] = useState<Kind>('extract');
  const [ranges, setRanges] = useState('');
  const [every, setEvery] = useState(1);
  const thumbs = useThumbnails(file?.file ?? null);
  const { state, run, cancel, reset } = useOperation('split');

  const pageItems = Array.from({ length: thumbs.pageCount ?? 0 }, (_, i) => ({
    key: String(i),
    index: i,
    rotate: 0 as const,
  }));
  const ready = !!file && (kind === 'every' ? every >= 1 : ranges.trim() !== '');

  const go = () =>
    run(async () => {
      const bytes = await file!.file.arrayBuffer();
      const mode: SplitMode = kind === 'every' ? { kind, every } : { kind, ranges };
      return { args: { file: { name: file!.file.name, bytes }, mode }, transfer: [bytes] };
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
        {thumbs.error && (
          <p className="stamp stamp-error" role="alert">
            {thumbs.error.message}
          </p>
        )}
        {thumbs.pageCount !== null && (
          <>
            <p className="hint page-count">{thumbs.pageCount} pages</p>
            <PageGrid items={pageItems} urls={thumbs.urls} label="Pages in this PDF" />
          </>
        )}
      </section>
      <section className="sheet" aria-labelledby="step-options">
        <h2 id="step-options">2. How to split</h2>
        <fieldset className="choices stack">
          <legend className="visually-hidden">Split mode</legend>
          {KINDS.map((k) => (
            <label key={k.kind} className="choice">
              <input
                type="radio"
                name="split-kind"
                value={k.kind}
                checked={kind === k.kind}
                onChange={() => setKind(k.kind)}
              />
              <span>
                <span className="choice-label">{k.label}</span>
                <span className="choice-hint">{k.hint}</span>
              </span>
            </label>
          ))}
        </fieldset>
        {kind === 'every' ? (
          <label className="field">
            <span>Pages per file</span>
            <input
              type="number"
              min={1}
              max={thumbs.pageCount ?? undefined}
              value={every}
              onChange={(e) => setEvery(Number(e.target.value))}
            />
          </label>
        ) : (
          <label className="field">
            <span>Pages</span>
            <input
              type="text"
              inputMode="numeric"
              placeholder="1-3, 7, 10-"
              value={ranges}
              onChange={(e) => setRanges(e.target.value)}
            />
          </label>
        )}
        <RunPanel state={state} busyLabel="Splitting" onCancel={cancel} onReset={reset}>
          <button
            type="button"
            className="button button-primary button-wide"
            disabled={!ready}
            onClick={go}
          >
            Split PDF
          </button>
        </RunPanel>
      </section>
    </ToolPage>
  );
}
