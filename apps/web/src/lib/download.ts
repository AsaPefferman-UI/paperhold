import type { OutputFile } from '@pdf-tools/core';

export interface DownloadableFile {
  name: string;
  size: number;
  url: string;
}

/** Object URLs for results. Caller must `revokeAll` when the result is dismissed. */
export function toDownloads(files: OutputFile[]): DownloadableFile[] {
  return files.map((f) => ({
    name: f.name,
    size: f.bytes.byteLength,
    url: URL.createObjectURL(new Blob([f.bytes as Uint8Array<ArrayBuffer>], { type: f.mime })),
  }));
}

export function revokeAll(files: DownloadableFile[]): void {
  for (const f of files) URL.revokeObjectURL(f.url);
}
