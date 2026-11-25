import { defineConfig } from '@playwright/test';

// Opt-in media production only; these jobs are not part of CI or release checks.
export default defineConfig({
  testDir: '../../src/capture',
  testMatch: '**/*.capture.ts',
  outputDir: '../../.output/capture-results',
  workers: 1,
  retries: 0,
  timeout: 30_000,
  reporter: 'list',
});
