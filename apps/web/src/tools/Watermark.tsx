import { useState } from 'react';
import { RunPanel } from '../components/RunPanel.tsx';
import { SingleFile } from '../components/SingleFile.tsx';
import { ToolPage } from '../components/ToolPage.tsx';
import { isPdf, type PickedFile } from '../lib/files.ts';
import { useOperation } from '../lib/useOperation.ts';
import type { ToolMeta } from '../tools.ts';

type Color = 'gray' | 'red' | 'blue';

export default function Watermark({ tool }: { tool: ToolMeta }) {
  const [file, setFile] = useState<PickedFile | null>(null);
  const [text, setText] = useState('CONFIDENTIAL');
  const [fontSize, setFontSize] = useState(64);
  const [opacity, setOpacity] = useState(25);
  const [angle, setAngle] = useState(45);
  const [color, setColor] = useState<Color>('gray');
  const [pages, setPages] = useState('');
  const { state, run, cancel, reset } = useOperation('watermark');

  const go = () =>
    run(async () => {
      const bytes = await file!.file.arrayBuffer();
      return {
        args: {
          file: { name: file!.file.name, bytes },
          text,
          fontSize,
          opacity: opacity / 100,
          angle,
          color,
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
        <h2 id="step-options">2. Watermark</h2>
        <div className="fields">
          <label className="field field-wide">
            <span>Text</span>
            <input
              type="text"
              maxLength={200}
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
          </label>
          <label className="field">
            <span>Text size (pt)</span>
            <input
              type="number"
              min={6}
              max={300}
              value={fontSize}
              onChange={(e) => setFontSize(Number(e.target.value))}
            />
          </label>
          <label className="field">
            <span>Opacity: {opacity}%</span>
            <input
              type="range"
              min={5}
              max={100}
              step={5}
              value={opacity}
              onChange={(e) => setOpacity(Number(e.target.value))}
            />
          </label>
          <label className="field">
            <span>Direction</span>
            <select value={angle} onChange={(e) => setAngle(Number(e.target.value))}>
              <option value={45}>Diagonal, rising</option>
              <option value={-45}>Diagonal, falling</option>
              <option value={0}>Horizontal</option>
            </select>
          </label>
          <label className="field">
            <span>Colour</span>
            <select value={color} onChange={(e) => setColor(e.target.value as Color)}>
              <option value="gray">Grey</option>
              <option value="red">Red</option>
              <option value="blue">Blue</option>
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
        <RunPanel state={state} busyLabel="Adding watermark" onCancel={cancel} onReset={reset}>
          <button
            type="button"
            className="button button-primary button-wide"
            disabled={!file || !text.trim()}
            onClick={go}
          >
            Add watermark
          </button>
        </RunPanel>
      </section>
    </ToolPage>
  );
}
