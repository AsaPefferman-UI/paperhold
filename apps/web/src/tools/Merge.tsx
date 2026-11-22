import { useState } from 'react';
import { FileDrop } from '../components/FileDrop.tsx';
import { FileList } from '../components/FileList.tsx';
import { RunPanel } from '../components/RunPanel.tsx';
import { ToolPage } from '../components/ToolPage.tsx';
import { isPdf, pickFiles, type PickedFile } from '../lib/files.ts';
import { useOperation } from '../lib/useOperation.ts';
import type { ToolMeta } from '../tools.ts';

export default function Merge({ tool }: { tool: ToolMeta }) {
  const [files, setFiles] = useState<PickedFile[]>([]);
  const [refused, setRefused] = useState<string[]>([]);
  const { state, run, cancel, reset } = useOperation('merge');

  const add = (list: File[]) => {
    const result = pickFiles(list, isPdf);
    setFiles((prev) => [...prev, ...result.picked]);
    setRefused(result.refused);
    if (state.status === 'done' || state.status === 'error') reset();
  };

  const merge = () =>
    run(async () => {
      const buffers = await Promise.all(files.map((f) => f.file.arrayBuffer()));
      return {
        args: { files: files.map((f, i) => ({ name: f.file.name, bytes: buffers[i]! })) },
        transfer: buffers,
      };
    });

  return (
    <ToolPage tool={tool}>
      <section className="sheet" aria-labelledby="step-files">
        <h2 id="step-files">1. Add PDFs</h2>
        <FileDrop
          accept={tool.accept}
          label="Choose PDFs or drop them here"
          hint="Add two or more. You can add more later."
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
            label="Files to merge, in order"
            onChange={(next) => {
              setFiles(next);
              if (state.status !== 'running') reset();
            }}
          />
        )}
      </section>
      <section className="sheet" aria-labelledby="step-run">
        <h2 id="step-run">2. Merge</h2>
        <RunPanel state={state} busyLabel="Merging" onCancel={cancel} onReset={reset}>
          <button
            type="button"
            className="button button-primary button-wide"
            disabled={files.length < 2}
            onClick={merge}
          >
            Merge {files.length >= 2 ? `${files.length} PDFs` : 'PDFs'}
          </button>
          {files.length < 2 && <p className="hint">Add at least two PDFs to merge.</p>}
        </RunPanel>
      </section>
    </ToolPage>
  );
}
