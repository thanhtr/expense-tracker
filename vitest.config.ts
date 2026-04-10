import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['lib/**/*.ts', 'app/api/**/*.ts'],
      exclude: [
        'node_modules/',
        '__tests__/',
        'lib/db.ts', // Prisma client
      ],
    },
    exclude: [
      'node_modules/',
      '.next/',
      '.github/',
      '__tests__/e2e/**', // E2E tests use Playwright, not Vitest
    ],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './'),
    },
  },
});
