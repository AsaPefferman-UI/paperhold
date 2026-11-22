import { PdfToolsError } from './errors.ts';

/** An inclusive, 0-based page range. */
export interface PageRange {
  start: number;
  end: number;
}

/**
 * Parse "1-3, 5, 8-" (1-based, as people write it) into 0-based inclusive ranges.
 * "8-" means "8 to the end"; "-3" means "1 to 3". Order is preserved; overlaps are allowed.
 */
export function parsePageRanges(input: string, pageCount: number): PageRange[] {
  const parts = input
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length === 0) throw new PdfToolsError('invalid_input', 'Enter at least one page.');
  return parts.map((part) => {
    const m = /^(\d*)\s*(?:-\s*(\d*))?$/.exec(part);
    if (!m || (m[1] === '' && (m[2] === undefined || m[2] === ''))) {
      throw new PdfToolsError('invalid_input', `"${part}" is not a page or range like 2-5.`);
    }
    const isRange = m[2] !== undefined;
    const start = m[1] === '' ? 1 : Number(m[1]);
    const end = isRange ? (m[2] === '' ? pageCount : Number(m[2])) : start;
    if (start < 1 || end < 1) throw new PdfToolsError('invalid_input', 'Pages start at 1.');
    if (start > pageCount || end > pageCount) {
      throw new PdfToolsError(
        'invalid_input',
        `"${part}" goes past the last page. This PDF has ${pageCount} pages.`,
      );
    }
    if (start > end) {
      throw new PdfToolsError(
        'invalid_input',
        `"${part}" runs backwards. Write it as ${end}-${start}.`,
      );
    }
    return { start: start - 1, end: end - 1 };
  });
}

/** Expand ranges to page indices, in order. */
export function rangeIndices(ranges: PageRange[]): number[] {
  return ranges.flatMap(({ start, end }) =>
    Array.from({ length: end - start + 1 }, (_, i) => start + i),
  );
}

/** "1-3" style label for a range (1-based), for file names. */
export function rangeLabel({ start, end }: PageRange): string {
  return start === end ? `${start + 1}` : `${start + 1}-${end + 1}`;
}
