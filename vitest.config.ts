import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts', 'shared/**/*.test.ts', 'server/**/*.test.ts'],
    testTimeout: 30000,
  },
  resolve: {
    alias: {
      '@trao/shared': path.resolve(__dirname, 'shared/src'),
    },
  },
});
