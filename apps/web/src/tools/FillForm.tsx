import type { FieldValue, FormField } from '@pdf-tools/core';
import { useEffect, useState } from 'react';
import { RunPanel } from '../components/RunPanel.tsx';
import { SingleFile } from '../components/SingleFile.tsx';
import { ToolPage } from '../components/ToolPage.tsx';
import { isPdf, type PickedFile } from '../lib/files.ts';
import { useOperation } from '../lib/useOperation.ts';
import type { ToolMeta } from '../tools.ts';

type Editable = Exclude<FormField, { type: 'unsupported' }>;

function FieldInput({
  field,
  value,
  onChange,
}: {
  field: Editable;
  value: FieldValue;
  onChange: (v: FieldValue) => void;
}) {
  const id = `field-${field.name}`;
  const label = <span>{field.name}</span>;
  switch (field.type) {
    case 'checkbox':
      return (
        <label className="check field-wide" htmlFor={id}>
          <input
            id={id}
            type="checkbox"
            checked={value === true}
            disabled={field.readOnly}
            onChange={(e) => onChange(e.target.checked)}
          />
          {label}
        </label>
      );
    case 'radio':
      return (
        <fieldset className="field field-wide radio-row">
          <legend>{field.name}</legend>
          {field.options.map((o) => (
            <label key={o} className="check">
              <input
                type="radio"
                name={id}
                value={o}
                checked={value === o}
                disabled={field.readOnly}
                onChange={() => onChange(o)}
              />
              <span>{o}</span>
            </label>
          ))}
        </fieldset>
      );
    case 'dropdown':
      return (
        <label className="field" htmlFor={id}>
          {label}
          <select
            id={id}
            value={value as string}
            disabled={field.readOnly}
            onChange={(e) => onChange(e.target.value)}
          >
            <option value="">(none)</option>
            {field.options.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        </label>
      );
    case 'list':
      return (
        <label className="field" htmlFor={id}>
          {label}
          <select
            id={id}
            multiple
            value={value as string[]}
            disabled={field.readOnly}
            onChange={(e) => onChange([...e.target.selectedOptions].map((o) => o.value))}
          >
            {field.options.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        </label>
      );
    case 'text':
      return (
        <label className={`field${field.multiline ? ' field-wide' : ''}`} htmlFor={id}>
          {label}
          {field.multiline ? (
            <textarea
              id={id}
              rows={4}
              value={value as string}
              maxLength={field.maxLength}
              readOnly={field.readOnly}
              onChange={(e) => onChange(e.target.value)}
            />
          ) : (
            <input
              id={id}
              type="text"
              value={value as string}
              maxLength={field.maxLength}
              readOnly={field.readOnly}
              onChange={(e) => onChange(e.target.value)}
            />
          )}
        </label>
      );
  }
}

export default function FillForm({ tool }: { tool: ToolMeta }) {
  const [file, setFile] = useState<PickedFile | null>(null);
  // A Map, not an object: field names come from the file and may be "__proto__" or similar.
  const [values, setValues] = useState<Map<string, FieldValue>>(new Map());
  const [flatten, setFlatten] = useState(false);
  const inspect = useOperation('inspectForm');
  const fill = useOperation('fillForm');
  const { run: inspectRun } = inspect;

  useEffect(() => {
    if (!file) return;
    void inspectRun(async () => {
      const bytes = await file.file.arrayBuffer();
      return { args: { file: { name: file.file.name, bytes } }, transfer: [bytes] };
    });
  }, [file, inspectRun]);

  const fields =
    file && inspect.state.status === 'done' ? (inspect.state.data as FormField[]) : null;
  const editable = (fields ?? []).filter((f): f is Editable => f.type !== 'unsupported');
  const valueOf = (f: Editable): FieldValue => values.get(f.name) ?? f.value;

  const save = () =>
    fill.run(async () => {
      const bytes = await file!.file.arrayBuffer();
      return {
        args: {
          file: { name: file!.file.name, bytes },
          values: Object.fromEntries(values),
          flatten,
        },
        transfer: [bytes],
      };
    });

  return (
    <ToolPage tool={tool}>
      <section className="sheet" aria-labelledby="step-fields">
        <h2 id="step-fields">1. Choose a PDF form, then fill it in</h2>
        <SingleFile
          accept={tool.accept}
          isAccepted={isPdf}
          label="Choose a PDF form or drop it here"
          hint="Works with standard PDF forms (AcroForm)."
          file={file}
          onChange={(f) => {
            setFile(f);
            setValues(new Map());
            fill.reset();
            if (!f) inspect.reset();
          }}
        />
        {inspect.state.status === 'running' && <p className="hint">Reading the form…</p>}
        {inspect.state.status === 'error' && (
          <p className="stamp stamp-error" role="alert">
            {inspect.state.error.message}
          </p>
        )}
        {fields && editable.length === 0 && (
          <p className="stamp stamp-error" role="alert">
            This PDF has no fillable fields. If it is a scan, use Sign or Watermark to add text
            instead.
          </p>
        )}
        {editable.length > 0 && (
          <div className="fields form-fields">
            {editable.map((f) => (
              <FieldInput
                key={f.name}
                field={f}
                value={valueOf(f)}
                onChange={(v) => {
                  setValues((prev) => new Map(prev).set(f.name, v));
                  if (fill.state.status !== 'running') fill.reset();
                }}
              />
            ))}
          </div>
        )}
      </section>
      <section className="sheet" aria-labelledby="step-save">
        <h2 id="step-save">2. Save</h2>
        <label className="check">
          <input
            type="checkbox"
            checked={flatten}
            onChange={(e) => {
              setFlatten(e.target.checked);
              if (fill.state.status !== 'running') fill.reset();
            }}
          />
          <span>Flatten: make the answers part of the page so they can no longer be edited</span>
        </label>
        <RunPanel state={fill.state} busyLabel="Saving" onCancel={fill.cancel} onReset={fill.reset}>
          <button
            type="button"
            className="button button-primary button-wide"
            disabled={editable.length === 0}
            onClick={save}
          >
            {flatten ? 'Save flattened PDF' : 'Save filled PDF'}
          </button>
        </RunPanel>
      </section>
    </ToolPage>
  );
}
