import { describe, expect, it } from 'vitest';
import { isBusy, startBusy } from './busy.ts';

describe('busy counter', () => {
  it('stays busy until every operation ends, and ignores double ends', () => {
    expect(isBusy()).toBe(false);
    const a = startBusy();
    const b = startBusy();
    a();
    a();
    expect(isBusy()).toBe(true);
    b();
    expect(isBusy()).toBe(false);
  });
});
