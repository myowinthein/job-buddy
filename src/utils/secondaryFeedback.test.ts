import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createPreviewChrome } from '@/src/preview/chrome';
import { resetSecondaryFeedback, takeSecondaryFeedback } from './secondaryFeedback';

beforeEach(() => vi.stubGlobal('chrome', createPreviewChrome()));
afterEach(() => vi.unstubAllGlobals());

it('claims concurrent notices once and persists the claim across module reloads', async () => {
  expect(
    await Promise.all([
      takeSecondaryFeedback('drive', 'profile-a', 'sync_error'),
      takeSecondaryFeedback('drive', 'profile-a', 'sync_error'),
    ]),
  ).toEqual([true, false]);
  vi.resetModules();
  const reloaded = await import('./secondaryFeedback');
  expect(await reloaded.takeSecondaryFeedback('drive', 'profile-a', 'sync_error')).toBe(false);
});

it('allows distinct issues, scope changes, recovery, and a fresh browser session', async () => {
  expect(await takeSecondaryFeedback('drive', 'profile-a', 'sync_error')).toBe(true);
  expect(await takeSecondaryFeedback('drive', 'profile-a', 'token_expired')).toBe(true);
  expect(await takeSecondaryFeedback('drive', 'profile-a', 'sync_error')).toBe(false);
  expect(await takeSecondaryFeedback('drive', 'profile-b', 'sync_error')).toBe(true);
  await resetSecondaryFeedback('drive');
  expect(await takeSecondaryFeedback('drive', 'profile-b', 'sync_error')).toBe(true);
  vi.stubGlobal('chrome', createPreviewChrome());
  expect(await takeSecondaryFeedback('drive', 'profile-b', 'sync_error')).toBe(true);
});
