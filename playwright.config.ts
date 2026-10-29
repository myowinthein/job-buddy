import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './src/browser',
  testMatch: '**/*.pw.ts',
  outputDir: '.output/browser-results',
  workers: 1,
  timeout: 30_000,
  reporter: 'list',
});
