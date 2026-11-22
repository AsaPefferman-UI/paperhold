import { describe, expect, it } from 'vitest';
import { allowed } from './check-licenses.ts';

describe('license allowlist', () => {
  it('handles single ids and AND / OR expressions', () => {
    expect(allowed('MIT')).toBe(true);
    expect(allowed('(MIT AND Zlib)')).toBe(true);
    expect(allowed('(MIT OR SSPL-1.0)')).toBe(true);
    expect(allowed('(MIT AND SSPL-1.0)')).toBe(false);
    expect(allowed('BUSL-1.1')).toBe(false);
    expect(allowed('UNKNOWN')).toBe(false);
  });
});
