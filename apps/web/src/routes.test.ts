import { describe, expect, it } from 'vitest';
import { ROUTES } from './routes.tsx';
import { TOOLS } from './tools.ts';

describe('tool routing', () => {
  it('has a route for every tool and no route without a tool', () => {
    expect(Object.keys(ROUTES).sort()).toEqual(TOOLS.map((t) => t.path).sort());
  });
});
