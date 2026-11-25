import { describe, expect, it } from 'vitest';
import { readFixture } from '../fixtures/corpus.ts';
import { mutate, rng } from '../fuzz/mutate.ts';

describe('fuzz mutator', () => {
  it('is deterministic for a seed, so failures can be replayed', () => {
    const input = readFixture('simple.pdf');
    const a = mutate(input, rng(42), input);
    const b = mutate(input, rng(42), input);
    expect(a.applied).toEqual(b.applied);
    expect([...a.bytes]).toEqual([...b.bytes]);
    expect(mutate(input, rng(43), input).bytes).not.toEqual(a.bytes);
  });

  it('produces values in [0, 1) and never mutates its input', () => {
    const r = rng(1);
    for (let i = 0; i < 1000; i++) {
      const v = r();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
    const input = readFixture('simple.pdf');
    const copy = input.slice();
    for (let i = 0; i < 50; i++) mutate(input, r, input);
    expect(input).toEqual(copy);
  });
});
