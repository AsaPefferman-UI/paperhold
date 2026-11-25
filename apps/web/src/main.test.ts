import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const src = (p: string) => readFileSync(join(import.meta.dirname, p), 'utf8');

describe('cascade layer order', () => {
  it('imports the style entry before anything else, so the layer order is declared first', () => {
    const firstImport = src('main.tsx').match(/^import .+$/m)?.[0];
    expect(firstImport).toBe("import './styles/index.css';");
  });

  it('declares the layer order as the first rule of the style entry', () => {
    const firstRule = src('styles/index.css')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .trim()
      .split(';')[0];
    expect(firstRule).toBe('@layer tokens, base, components, utilities');
  });
});
