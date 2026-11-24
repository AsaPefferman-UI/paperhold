import { useState } from 'react';
import { RunPanel } from '../components/RunPanel.tsx';
import { SingleFile } from '../components/SingleFile.tsx';
import { ToolPage } from '../components/ToolPage.tsx';
import { isPdf, type PickedFile } from '../lib/files.ts';
import { useOperation } from '../lib/useOperation.ts';
import type { ToolMeta } from '../tools.ts';

export default function Unlock({ tool }: { tool: ToolMeta }) {
  const [file, setFile] = useState<PickedFile | null>(null);
  const [password, setPassword] = useState('');
  const { state, run, cancel, reset } = useOperation('unlock');

  const go = () =>
    run(async () => {
      const bytes = await file!.file.arrayBuffer();
      return { args: { file: { name: file!.file.name, bytes }, password }, transfer: [bytes] };
    });

  return (
    <ToolPage tool={tool}>
      <section className="sheet" aria-labelledby="step-file">
        <h2 id="step-file">1. Choose a protected PDF</h2>
        <SingleFile
          accept={tool.accept}
          isAccepted={isPdf}
          label="Choose a PDF or drop it here"
          hint="You need to know its password. This tool cannot crack passwords."
          file={file}
          onChange={(f) => {
            setFile(f);
            reset();
          }}
        />
      </section>
      <section className="sheet" aria-labelledby="step-password">
        <h2 id="step-password">2. Enter its password</h2>
        <label className="field">
          <span>Password</span>
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              if (state.status === 'error') reset();
            }}
          />
        </label>
        <p className="hint">
          Leave it empty if the PDF opens without a password but blocks printing or copying.
        </p>
        <RunPanel state={state} busyLabel="Unlocking" onCancel={cancel} onReset={reset}>
          <button
            type="button"
            className="button button-primary button-wide"
            disabled={!file}
            onClick={go}
          >
            Remove password
          </button>
        </RunPanel>
      </section>
    </ToolPage>
  );
}
