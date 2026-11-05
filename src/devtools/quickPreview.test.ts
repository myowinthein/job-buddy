// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createPreviewChrome } from '@/src/preview/chrome';
import {
  cleanupPreviewSeeds,
  loadPreviewSeed,
  preparePreview,
  PREVIEW_SEED_PREFIX,
  previewUrl,
  readQuickPreview,
} from './quickPreview';

beforeEach(() => {
  sessionStorage.clear();
  history.replaceState(null, '', '/options.html');
  vi.stubGlobal(
    'chrome',
    createPreviewChrome({ id: 'saved-profile' }, undefined, {
      initialData: {
        geminiApiKey: 'synthetic-private-key',
        driveToken: 'synthetic-private-token',
        themePreference: 'dark',
        learnedMappings: { 'example.test': { email: 'personal.email' } },
      },
    }),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it('copies only profile, mappings and appearance when entering a saved-profile preview', async () => {
  const id = await preparePreview('saved');
  const raw = sessionStorage.getItem(PREVIEW_SEED_PREFIX + id)!;
  expect(raw).not.toContain('synthetic-private');
  const url = previewUrl('saved', true, id);
  const preview = readQuickPreview(new URL(url).search)!;
  expect(preview.missingKey).toBe(true);
  expect(loadPreviewSeed(preview)).toEqual({
    profile: { id: 'saved-profile' },
    initialData: {
      themePreference: 'dark',
      learnedMappings: { 'example.test': { email: 'personal.email' } },
    },
  });
});

it('keeps the active seed intact when another preset navigation may be cancelled', async () => {
  const active = await preparePreview('saved');
  history.replaceState(null, '', previewUrl('saved', false, active));
  const before = sessionStorage.getItem(PREVIEW_SEED_PREFIX + active);
  const next = await preparePreview('empty');
  expect(sessionStorage.getItem(PREVIEW_SEED_PREFIX + active)).toBe(before);
  expect(JSON.parse(sessionStorage.getItem(PREVIEW_SEED_PREFIX + next)!)).toEqual({
    themePreference: 'dark',
  });
  sessionStorage.setItem('unrelated-state', 'keep');
  cleanupPreviewSeeds(next);
  expect(sessionStorage.getItem(PREVIEW_SEED_PREFIX + active)).toBeNull();
  expect(sessionStorage.getItem('unrelated-state')).toBe('keep');
});

it('fails closed for invalid or missing saved preview data', () => {
  expect(() => readQuickPreview('?devPreview=unknown')).toThrow('Unknown profile preview');
  expect(() => readQuickPreview('?devPreview=saved&devPreviewSeed=../bad')).toThrow(
    'Invalid preview seed',
  );
  expect(() => loadPreviewSeed(readQuickPreview('?devPreview=saved')!)).toThrow('unavailable');
});
