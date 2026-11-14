import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './src/browser',
  testMatch: '**/*.pw.ts',
  outputDir: '.output/browser-results',
  workers: 1,
  // One retry on CI keeps a slow runner from blocking a release; retried tests are still reported as flaky.
  retries: process.env.CI ? 1 : 0,
  timeout: 30_000,
  reporter: 'list',
});
