import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'web',
    include: ['src/**/*.test.{ts,tsx}', '*.test.ts'],
    environment: 'node',
  },
});
