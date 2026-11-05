// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createPreviewChrome } from '@/src/preview/chrome';

let dispose: (() => void) | undefined;
beforeEach(() => {
  vi.resetModules();
  vi.stubEnv('DEV', true);
  history.replaceState(null, '', '/options.html');
  sessionStorage.clear();
  dispose = undefined;
  vi.stubGlobal('__JB_DEV_CONTEXT__', undefined);
});
afterEach(async () => {
  dispose?.();
  const bootstrap = await import('./bootstrap');
  bootstrap.getSimulation()?.dispose();
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

it('replaces APIs before use and leaves the original storage and network untouched', async () => {
  const original = createPreviewChrome({ id: 'real-profile' });
  vi.stubGlobal('chrome', {
    ...original,
    runtime: { ...original.runtime, id: 'extension', getManifest: () => ({ version: '1.0' }) },
  });
  const originalFetch = vi.fn();
  vi.stubGlobal('fetch', originalFetch);
  history.replaceState(null, '', '?devPreview=empty');
  const { initializeDevPreview, getSimulation } = await import('./bootstrap');
  dispose = initializeDevPreview();
  expect(chrome.storage).not.toBe(original.storage);
  expect(sessionStorage.getItem('jb:ui:section')).toBeNull();
  await new Promise<void>((resolve) =>
    chrome.storage.local.set({ profile: { id: 'temporary-edit' } }, resolve),
  );
  const result = await new Promise((resolve) => original.storage.local.get('profile', resolve));
  expect(result).toEqual({ profile: { id: 'real-profile' } });
  await expect(fetch('https://unexpected.example/data')).rejects.toThrow('disabled');
  expect(originalFetch).not.toHaveBeenCalled();
  getSimulation()?.dispose();
});

it('ignores retired launcher URLs without changing storage or navigation', async () => {
  const original = createPreviewChrome();
  vi.stubGlobal('chrome', original);
  history.replaceState(null, '', '?devScenario=profile-empty&devTools=1');
  const { initializeDevPreview, getSimulation } = await import('./bootstrap');
  dispose = initializeDevPreview();
  expect(chrome).toBe(original);
  expect(getSimulation()).toBeUndefined();
  expect(sessionStorage.getItem('jb:ui:section')).toBeNull();
});

it('keeps the selected page when starting a required-only preview with a missing key', async () => {
  const original = createPreviewChrome({ id: 'original' });
  vi.stubGlobal('chrome', original);
  sessionStorage.setItem('jb:ui:section', 'education');
  history.replaceState(null, '', '?devPreview=required&devNoKey=1&devDrive=1');
  const { initializeDevPreview } = await import('./bootstrap');
  dispose = initializeDevPreview();
  expect(sessionStorage.getItem('jb:ui:section')).toBe('education');
  expect(globalThis.__JB_DEV_CONTEXT__?.quickPreview).toBe('required');
  const data = await new Promise<Record<string, unknown>>((resolve) =>
    chrome.storage.local.get(
      ['profile', 'geminiApiKey', 'driveToken'],
      (data: Record<string, unknown>) => resolve(data),
    ),
  );
  expect(data.geminiApiKey).toBeUndefined();
  expect(data.driveToken).toBe('simulated-token');
  expect((data.profile as { id: string }).id).toBe('dev-preview-sample');
  expect(chrome.storage).not.toBe(original.storage);
});

it('does not mount a saved-profile preview without its isolated seed', async () => {
  const original = createPreviewChrome({ id: 'original' });
  vi.stubGlobal('chrome', original);
  history.replaceState(null, '', '?devPreview=saved');
  const { initializeDevPreview } = await import('./bootstrap');
  expect(initializeDevPreview).toThrow('Saved profile preview is unavailable');
  expect(chrome).toBe(original);
});

it('ignores simulation URLs in production', async () => {
  vi.stubEnv('DEV', false);
  const original = createPreviewChrome();
  vi.stubGlobal('chrome', original);
  history.replaceState(null, '', '?devPreview=empty');
  const { initializeDevPreview } = await import('./bootstrap');
  initializeDevPreview();
  expect(chrome).toBe(original);
  expect(globalThis.__JB_DEV_CONTEXT__).toBeUndefined();
});
