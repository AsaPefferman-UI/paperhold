import { describe, expect, it } from 'vitest';
import { isPdf, moveItem, pickFiles } from './files.ts';

const fakeFile = (name: string, size: number, type = 'application/pdf') =>
  ({ name, size, type }) as File;

describe('pickFiles', () => {
  it('accepts, warns on large files, and refuses oversized or wrong types', () => {
    const { picked, refused } = pickFiles(
      [
        fakeFile('a.pdf', 10),
        fakeFile('big.pdf', 300 * 1024 ** 2),
        fakeFile('huge.pdf', 2 * 1024 ** 3),
        fakeFile('x.txt', 1, 'text/plain'),
      ],
      isPdf,
    );
    expect(picked.map((p) => [p.file.name, p.size])).toEqual([
      ['a.pdf', 'ok'],
      ['big.pdf', 'warn'],
    ]);
    expect(refused).toHaveLength(2);
    expect(refused[0]).toMatch(/^huge\.pdf: .*limit/);
    expect(refused[1]).toMatch(/^x\.txt/);
    expect(new Set(picked.map((p) => p.id)).size).toBe(2);
  });

  it('recognises PDFs by type or extension', () => {
    expect(isPdf(fakeFile('A.PDF', 1, ''))).toBe(true);
    expect(isPdf(fakeFile('a.png', 1, 'image/png'))).toBe(false);
  });
});

describe('moveItem', () => {
  it('moves within bounds and ignores out-of-range targets', () => {
    expect(moveItem(['a', 'b', 'c'], 0, 2)).toEqual(['b', 'c', 'a']);
    expect(moveItem(['a', 'b', 'c'], 2, 0)).toEqual(['c', 'a', 'b']);
    expect(moveItem(['a', 'b'], 0, -1)).toEqual(['a', 'b']);
    expect(moveItem(['a', 'b'], 1, 2)).toEqual(['a', 'b']);
  });
});
