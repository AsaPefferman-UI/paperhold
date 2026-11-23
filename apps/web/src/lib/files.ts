import { checkFileSize, PdfToolsError, type SizeVerdict } from '@pdf-tools/core';

export interface PickedFile {
  id: string;
  file: File;
  /** 'warn' when over the soft size limit. */
  size: SizeVerdict;
}

let counter = 0;

/** Validate sizes up front; returns accepted files plus one message per refused file. */
export function pickFiles(
  list: Iterable<File>,
  accept: (f: File) => boolean,
): {
  picked: PickedFile[];
  refused: string[];
} {
  const picked: PickedFile[] = [];
  const refused: string[] = [];
  for (const file of list) {
    if (!accept(file)) {
      refused.push(`${file.name}: this tool does not accept this type of file.`);
      continue;
    }
    try {
      picked.push({ id: `f${++counter}`, file, size: checkFileSize(file.size) });
    } catch (err) {
      refused.push(
        `${file.name}: ${err instanceof PdfToolsError ? err.message : 'could not be read.'}`,
      );
    }
  }
  return { picked, refused };
}

export const isPdf = (f: File) => f.type === 'application/pdf' || /\.pdf$/i.test(f.name);

export function moveItem<T>(items: readonly T[], from: number, to: number): T[] {
  if (to < 0 || to >= items.length || from === to) return [...items];
  const next = [...items];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item as T);
  return next;
}

export const isImage = (f: File) =>
  f.type.startsWith('image/') || /\.(jpe?g|png|gif|bmp|webp|heic|heif|avif)$/i.test(f.name);
