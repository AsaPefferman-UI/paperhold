import { formatBytes, type CompressPreset } from '@pdf-tools/core';
import { useState } from 'react';
import { RunPanel } from '../components/RunPanel.tsx';
import { SingleFile } from '../components/SingleFile.tsx';
import { ToolPage } from '../components/ToolPage.tsx';
import { isPdf, type PickedFile } from '../lib/files.ts';
import { useOperation } from '../lib/useOperation.ts';
import type { ToolMeta } from '../tools.ts';

const PRESETS: { value: CompressPreset; label: string; hint: string }[] = [
  { value: 'high', label: 'High quality', hint: 'Light compression, images stay sharp' },
  { value: 'balanced', label: 'Balanced', hint: 'Good for email and sharing' },
  { value: 'smallest', label: 'Smallest file', hint: 'Strong compression, images get softer' },
];

/** Large files on phones: say up front that it may take a while. */
const SLOW_BYTES = 50 * 1024 * 1024;

export default function Compress({ tool }: { tool: ToolMeta }) {
  const [file, setFile] = useState<PickedFile | null>(null);
  const [preset, setPreset] = useState<CompressPreset>('balanced');
  const { state, run, cancel, reset } = useOperation('compress');

  const go = () =>
    run(async () => {
      const bytes = await file!.file.arrayBuffer();
      return { args: { file: { name: file!.file.name, bytes }, preset }, transfer: [bytes] };
    });

  const result = state.status === 'done' ? state.files[0] : undefined;
  const before = file?.file.size ?? 0;
  const saved = result && before ? 1 - result.size / before : 0;

  return (
    <ToolPage tool={tool}>
      <section className="sheet" aria-labelledby="step-file">
        <h2 id="step-file">1. Choose a PDF</h2>
        <SingleFile
          accept={tool.accept}
          isAccepted={isPdf}
          label="Choose a PDF or drop it here"
          hint="Scanned documents and PDFs with photos shrink the most."
          file={file}
          onChange={(f) => {
            setFile(f);
            reset();
          }}
        />
        {file && file.file.size > SLOW_BYTES && (
          <p className="hint">
            This is a large file. Compressing it can take a minute, longer on a phone.
          </p>
        )}
      </section>
      <section className="sheet" aria-labelledby="step-options">
        <h2 id="step-options">2. Compression level</h2>
        <fieldset className="choices">
          <legend className="visually-hidden">Compression level</legend>
          {PRESETS.map((p) => (
            <label key={p.value} className="choice">
              <input
                type="radio"
                name="preset"
                value={p.value}
                checked={preset === p.value}
                onChange={() => {
                  setPreset(p.value);
                  if (state.status === 'done') reset();
                }}
              />
              <span>
                <span className="choice-label">{p.label}</span>
                <span className="choice-hint">{p.hint}</span>
              </span>
            </label>
          ))}
        </fieldset>
        {result && (
          <p className="saving" role="status">
            {saved > 0.005
              ? `${formatBytes(before)} to ${formatBytes(result.size)}: ${Math.round(saved * 100)}% smaller.`
              : 'This PDF is already well compressed, so the file is unchanged.'}
          </p>
        )}
        <RunPanel state={state} busyLabel="Compressing" onCancel={cancel} onReset={reset}>
          <button
            type="button"
            className="button button-primary button-wide"
            disabled={!file}
            onClick={go}
          >
            Compress PDF
          </button>
        </RunPanel>
      </section>
    </ToolPage>
  );
}
