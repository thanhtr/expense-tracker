import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    env: {
      SPLITWISE_USER_ID: '2206773',
      SPLITWISE_WIFE_ID: '14152499',
      SPLITWISE_GROUP_ID: '7014251',
    },
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
