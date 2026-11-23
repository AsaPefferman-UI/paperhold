import { pdfToImages, type ImageType } from '@pdf-tools/core';
import { useState } from 'react';
import { RunPanel } from '../components/RunPanel.tsx';
import { SingleFile } from '../components/SingleFile.tsx';
import { ToolPage } from '../components/ToolPage.tsx';
import { isPdf, type PickedFile } from '../lib/files.ts';
import { useOperation } from '../lib/useOperation.ts';
import type { ToolMeta } from '../tools.ts';

export default function PdfToImages({ tool }: { tool: ToolMeta }) {
  const [file, setFile] = useState<PickedFile | null>(null);
  const [type, setType] = useState<ImageType>('png');
  const [dpi, setDpi] = useState(150);
  const [pages, setPages] = useState('');
  // The result is produced on this page (pdf.js needs a canvas); the hook still gives progress and cancel.
  const { state, runLocal, cancel, reset } = useOperation();

  const go = () =>
    runLocal(async (signal, onProgress) => {
      const { pageRenderer } = await import('../lib/thumbnails.ts');
      const renderer = await pageRenderer(await file!.file.arrayBuffer());
      try {
        return await pdfToImages({ name: file!.file.name, type, dpi, pages }, renderer, {
          progress: onProgress,
          signal,
        });
      } finally {
        await renderer.destroy();
      }
    });

  return (
    <ToolPage tool={tool}>
      <section className="sheet" aria-labelledby="step-file">
        <h2 id="step-file">1. Choose a PDF</h2>
        <SingleFile
          accept={tool.accept}
          isAccepted={isPdf}
          label="Choose a PDF or drop it here"
          hint="One file at a time. Several pages download as a zip."
          file={file}
          onChange={(f) => {
            setFile(f);
            reset();
          }}
        />
      </section>
      <section className="sheet" aria-labelledby="step-options">
        <h2 id="step-options">2. Image settings</h2>
        <div className="fields">
          <label className="field">
            <span>Format</span>
            <select value={type} onChange={(e) => setType(e.target.value as ImageType)}>
              <option value="png">PNG (sharp text, larger)</option>
              <option value="jpeg">JPG (photos, smaller)</option>
            </select>
          </label>
          <label className="field">
            <span>Resolution</span>
            <select value={dpi} onChange={(e) => setDpi(Number(e.target.value))}>
              <option value={72}>72 DPI (screen)</option>
              <option value={150}>150 DPI (standard)</option>
              <option value={300}>300 DPI (print)</option>
            </select>
          </label>
          <label className="field field-wide">
            <span>Only these pages (optional)</span>
            <input
              type="text"
              inputMode="numeric"
              placeholder="All pages, or e.g. 1-3"
              value={pages}
              onChange={(e) => setPages(e.target.value)}
            />
          </label>
        </div>
        <RunPanel state={state} busyLabel="Rendering pages" onCancel={cancel} onReset={reset}>
          <button
            type="button"
            className="button button-primary button-wide"
            disabled={!file}
            onClick={go}
          >
            Convert to images
          </button>
        </RunPanel>
      </section>
    </ToolPage>
  );
}
