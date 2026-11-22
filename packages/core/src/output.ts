import { zipSync } from 'fflate';
import type { OutputFile } from './protocol.ts';

export const PDF_MIME = 'application/pdf';

/** "report.pdf" -> "report" (for derived names like "report-pages-1-3.pdf"). */
export function baseName(name: string): string {
  return name.replace(/\.[^./\\]+$/, '') || 'document';
}

/** One file stays as is; several become a single zip so the user downloads once. */
export function bundle(files: OutputFile[], zipName: string): OutputFile[] {
  if (files.length <= 1) return files;
  const seen = new Map<string, number>();
  const entries: Record<string, Uint8Array> = {};
  for (const f of files) {
    const n = seen.get(f.name) ?? 0;
    seen.set(f.name, n + 1);
    const name =
      n === 0 ? f.name : `${baseName(f.name)} (${n + 1})${f.name.slice(baseName(f.name).length)}`;
    // PDFs and images are already compressed; storing avoids burning CPU for nothing.
    entries[name] = f.bytes;
  }
  return [{ name: zipName, mime: 'application/zip', bytes: zipSync(entries, { level: 0 }) }];
}
