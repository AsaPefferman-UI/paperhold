import { useState } from 'react';
import { PageGrid, type PageItem } from '../components/PageGrid.tsx';
import { RunPanel } from '../components/RunPanel.tsx';
import { SingleFile } from '../components/SingleFile.tsx';
import { ToolPage } from '../components/ToolPage.tsx';
import { isPdf, type PickedFile } from '../lib/files.ts';
import { useOperation } from '../lib/useOperation.ts';
import { useThumbnails } from '../lib/useThumbnails.ts';
import type { ToolMeta } from '../tools.ts';

const initial = (count: number): PageItem[] =>
  Array.from({ length: count }, (_, i) => ({ key: `p${i}`, index: i, rotate: 0 }));

export default function Organize({ tool }: { tool: ToolMeta }) {
  const [file, setFile] = useState<PickedFile | null>(null);
  const thumbs = useThumbnails(file?.file ?? null);
  const { state, run, cancel, reset } = useOperation('organize');
  // Edits belong to one loaded document; a new document starts from its natural order.
  const docKey = `${file?.id}:${thumbs.pageCount}`;
  const [edits, setEdits] = useState<{ docKey: string; items: PageItem[] } | null>(null);
  const items = edits?.docKey === docKey ? edits.items : initial(thumbs.pageCount ?? 0);
  const setItems = (next: PageItem[]) => setEdits({ docKey, items: next });

  const changed =
    thumbs.pageCount !== null &&
    (items.length !== thumbs.pageCount || items.some((it, i) => it.index !== i || it.rotate !== 0));

  const save = () =>
    run(async () => {
      const bytes = await file!.file.arrayBuffer();
      return {
        args: {
          file: { name: file!.file.name, bytes },
          pages: items.map(({ index, rotate }) => ({ index, rotate })),
        },
        transfer: [bytes],
      };
    });

  const edit = (next: PageItem[]) => {
    setItems(next);
    if (state.status !== 'running') reset();
  };

  return (
    <ToolPage tool={tool}>
      <section className="sheet" aria-labelledby="step-pages">
        <h2 id="step-pages">1. Choose a PDF, then arrange its pages</h2>
        <SingleFile
          accept={tool.accept}
          isAccepted={isPdf}
          label="Choose a PDF or drop it here"
          hint="Drag pages to reorder them, or use the buttons under each page."
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
            <div className="toolbar">
              <span className="hint">
                {items.length} of {thumbs.pageCount} pages kept
              </span>
              <button
                type="button"
                className="button button-quiet"
                onClick={() =>
                  edit(
                    items.map((it) => ({
                      ...it,
                      rotate: ((it.rotate + 90) % 360) as PageItem['rotate'],
                    })),
                  )
                }
              >
                Rotate all right
              </button>
              <button
                type="button"
                className="button button-quiet"
                disabled={!changed}
                onClick={() => edit(initial(thumbs.pageCount ?? 0))}
              >
                Undo all changes
              </button>
            </div>
            <PageGrid
              items={items}
              urls={thumbs.urls}
              label="Pages, in output order"
              onChange={edit}
            />
          </>
        )}
      </section>
      <section className="sheet" aria-labelledby="step-save">
        <h2 id="step-save">2. Save</h2>
        <RunPanel state={state} busyLabel="Saving" onCancel={cancel} onReset={reset}>
          <button
            type="button"
            className="button button-primary button-wide"
            disabled={!file || items.length === 0}
            onClick={save}
          >
            Save PDF
          </button>
          {file && !changed && (
            <p className="hint">No changes yet. Saving makes an identical copy.</p>
          )}
        </RunPanel>
      </section>
    </ToolPage>
  );
}
