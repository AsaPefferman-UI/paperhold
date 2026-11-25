import { formatBytes, OCR_LANGUAGES, type OcrLanguage } from '@pdf-tools/core';
import { useState } from 'react';
import { RunPanel } from '../components/RunPanel.tsx';
import { SingleFile } from '../components/SingleFile.tsx';
import { ToolPage } from '../components/ToolPage.tsx';
import { isPdf, type PickedFile } from '../lib/files.ts';
import { downloadSize, makeSearchable, type OcrProgress } from '../lib/ocr.ts';
import { useOperation } from '../lib/useOperation.ts';
import type { ToolMeta } from '../tools.ts';

const isPhone = () => globalThis.matchMedia?.('(pointer: coarse)').matches ?? false;

function describe(p: OcrProgress | null): string {
  if (!p) return '';
  if (p.phase === 'download') return 'Getting the OCR engine ready…';
  if (p.phase === 'saving') return 'Adding the text layer…';
  const left =
    p.secondsLeft && p.pagesDone < p.pageCount
      ? `, about ${p.secondsLeft < 90 ? `${p.secondsLeft} s` : `${Math.round(p.secondsLeft / 60)} min`} left`
      : '';
  return `Read ${p.pagesDone} of ${p.pageCount} pages${left}.`;
}

export default function Ocr({ tool }: { tool: ToolMeta }) {
  const [file, setFile] = useState<PickedFile | null>(null);
  const [languages, setLanguages] = useState<OcrLanguage[]>(['eng']);
  const [progress, setProgress] = useState<OcrProgress | null>(null);
  const { state, runLocal, cancel, reset } = useOperation();

  const toggle = (code: OcrLanguage, on: boolean) =>
    setLanguages((prev) => (on ? [...prev, code] : prev.filter((l) => l !== code)));

  const go = () => {
    setProgress(null);
    return runLocal((signal, onProgress) =>
      makeSearchable(file!.file, languages, signal, (p) => {
        setProgress(p);
        onProgress(p.fraction);
      }),
    );
  };

  return (
    <ToolPage tool={tool}>
      <section className="sheet" aria-labelledby="step-file">
        <h2 id="step-file">1. Choose a scanned PDF</h2>
        <SingleFile
          accept={tool.accept}
          isAccepted={isPdf}
          label="Choose a PDF or drop it here"
          hint="Scans and photographed pages become searchable and selectable. They look the same."
          file={file}
          onChange={(f) => {
            setFile(f);
            reset();
          }}
        />
        {isPhone() && (
          <p className="hint">
            Reading text takes a few seconds per page and is slower on phones. Keep this tab open
            until it finishes.
          </p>
        )}
      </section>
      <section className="sheet" aria-labelledby="step-lang">
        <h2 id="step-lang">2. Language of the text</h2>
        <fieldset className="choices lang-choices" disabled={state.status === 'running'}>
          <legend className="visually-hidden">Languages</legend>
          {(Object.keys(OCR_LANGUAGES) as OcrLanguage[]).map((code) => (
            <label key={code} className="check">
              <input
                type="checkbox"
                checked={languages.includes(code)}
                onChange={(e) => toggle(code, e.target.checked)}
              />
              <span>{OCR_LANGUAGES[code]}</span>
            </label>
          ))}
        </fieldset>
        <p className="hint">
          The first run downloads the OCR engine and language data from this site (about{' '}
          {formatBytes(downloadSize(languages))}). Pages are read on your device.
        </p>
        {state.status === 'running' && progress && (
          <p className="hint ocr-status" aria-live="polite">
            {describe(progress)}
          </p>
        )}
        <RunPanel state={state} busyLabel="Reading text" onCancel={cancel} onReset={reset}>
          <button
            type="button"
            className="button button-primary button-wide"
            disabled={!file || languages.length === 0}
            onClick={go}
          >
            Make searchable
          </button>
          {languages.length === 0 && <p className="hint">Choose at least one language.</p>}
        </RunPanel>
      </section>
    </ToolPage>
  );
}
