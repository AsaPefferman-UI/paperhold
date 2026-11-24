import { useState } from 'react';
import { RunPanel } from '../components/RunPanel.tsx';
import { SingleFile } from '../components/SingleFile.tsx';
import { ToolPage } from '../components/ToolPage.tsx';
import { isPdf, type PickedFile } from '../lib/files.ts';
import { useOperation } from '../lib/useOperation.ts';
import type { ToolMeta } from '../tools.ts';

export default function Protect({ tool }: { tool: ToolMeta }) {
  const [file, setFile] = useState<PickedFile | null>(null);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [allowPrinting, setAllowPrinting] = useState(true);
  const [allowCopying, setAllowCopying] = useState(true);
  const [allowEditing, setAllowEditing] = useState(false);
  const { state, run, cancel, reset } = useOperation('protect');

  const mismatch = confirm !== '' && confirm !== password;
  const ready = !!file && password !== '' && password === confirm;

  const go = () =>
    run(async () => {
      const bytes = await file!.file.arrayBuffer();
      return {
        args: {
          file: { name: file!.file.name, bytes },
          userPassword: password,
          allowPrinting,
          allowCopying,
          allowEditing,
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
          hint="It is encrypted with AES-256 in your browser."
          file={file}
          onChange={(f) => {
            setFile(f);
            reset();
          }}
        />
      </section>
      <section className="sheet" aria-labelledby="step-password">
        <h2 id="step-password">2. Set a password</h2>
        <div className="fields">
          <label className="field field-wide">
            <span>Password</span>
            <input
              type={show ? 'text' : 'password'}
              autoComplete="new-password"
              value={password}
              maxLength={127}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          <label className="field field-wide">
            <span>Type it again</span>
            <input
              type={show ? 'text' : 'password'}
              autoComplete="new-password"
              value={confirm}
              maxLength={127}
              aria-invalid={mismatch}
              aria-describedby={mismatch ? 'pw-mismatch' : undefined}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </label>
          <label className="check field-wide">
            <input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} />
            <span>Show password</span>
          </label>
        </div>
        {mismatch && (
          <p id="pw-mismatch" className="hint hint-error">
            The passwords do not match.
          </p>
        )}
        {password !== '' && password.length < 8 && (
          <p className="hint">
            Short passwords are easy to guess. Use at least 8 characters, ideally a few words.
          </p>
        )}
        <fieldset className="choices">
          <legend className="legend">After opening, people may</legend>
          <label className="check">
            <input
              type="checkbox"
              checked={allowPrinting}
              onChange={(e) => setAllowPrinting(e.target.checked)}
            />
            <span>Print</span>
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={allowCopying}
              onChange={(e) => setAllowCopying(e.target.checked)}
            />
            <span>Copy text and images</span>
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={allowEditing}
              onChange={(e) => setAllowEditing(e.target.checked)}
            />
            <span>Edit</span>
          </label>
        </fieldset>
        <p className="hint">
          Keep the password safe: nobody, including us, can recover it. Permission limits are
          honoured by most PDF readers but cannot stop someone who can open the file.
        </p>
        <RunPanel state={state} busyLabel="Encrypting" onCancel={cancel} onReset={reset}>
          <button
            type="button"
            className="button button-primary button-wide"
            disabled={!ready}
            onClick={go}
          >
            Protect PDF
          </button>
        </RunPanel>
      </section>
    </ToolPage>
  );
}
