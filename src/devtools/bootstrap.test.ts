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
  history.replaceState(null, '', '?devScenario=profile-empty');
  const { initializeDevTools, getSimulation } = await import('./bootstrap');
  dispose = initializeDevTools();
  expect(chrome.storage).not.toBe(original.storage);
  expect(sessionStorage.getItem('jb:ui:section')).toBe('personal');
  await new Promise<void>((resolve) =>
    chrome.storage.local.set({ profile: { id: 'temporary-edit' } }, resolve),
  );
  const result = await new Promise((resolve) => original.storage.local.get('profile', resolve));
  expect(result).toEqual({ profile: { id: 'real-profile' } });
  await expect(fetch('https://unexpected.example/data')).rejects.toThrow('disabled');
  expect(originalFetch).not.toHaveBeenCalled();
  getSimulation()?.dispose();
});

it('rejects unknown scenarios before installing any simulated APIs', async () => {
  const original = createPreviewChrome();
  vi.stubGlobal('chrome', original);
  history.replaceState(null, '', '?devScenario=unknown');
  const { initializeDevTools } = await import('./bootstrap');
  expect(initializeDevTools).toThrow('Unknown development scenario');
  expect(chrome).toBe(original);
});

it('keeps the selected page when starting a required-only preview with a missing key', async () => {
  const original = createPreviewChrome({ id: 'original' });
  vi.stubGlobal('chrome', original);
  sessionStorage.setItem('jb:ui:section', 'education');
  history.replaceState(null, '', '?devPreview=required&devNoKey=1');
  const { initializeDevTools } = await import('./bootstrap');
  dispose = initializeDevTools();
  expect(sessionStorage.getItem('jb:ui:section')).toBe('education');
  expect(globalThis.__JB_DEV_CONTEXT__?.quickPreview).toBe('required');
  const data = await new Promise<Record<string, unknown>>((resolve) =>
    chrome.storage.local.get(['profile', 'geminiApiKey'], (data: Record<string, unknown>) =>
      resolve(data),
    ),
  );
  expect(data.geminiApiKey).toBeUndefined();
  expect((data.profile as { id: string }).id).toBe('dev-tools-sample');
  expect(chrome.storage).not.toBe(original.storage);
});

it('does not mount a saved-profile preview without its isolated seed', async () => {
  const original = createPreviewChrome({ id: 'original' });
  vi.stubGlobal('chrome', original);
  history.replaceState(null, '', '?devPreview=saved');
  const { initializeDevTools } = await import('./bootstrap');
  expect(initializeDevTools).toThrow('Saved profile preview is unavailable');
  expect(chrome).toBe(original);
});

it('ignores simulation URLs in production', async () => {
  vi.stubEnv('DEV', false);
  const original = createPreviewChrome();
  vi.stubGlobal('chrome', original);
  history.replaceState(null, '', '?devScenario=profile-empty');
  const { initializeDevTools } = await import('./bootstrap');
  initializeDevTools();
  expect(chrome).toBe(original);
  expect(globalThis.__JB_DEV_CONTEXT__).toBeUndefined();
});

it('starts an automatic action once after its real control becomes enabled', async () => {
  vi.stubGlobal('__JB_DEV_CONTEXT__', {
    scenario: 'ai-checking',
    id: 'instance',
    extensionId: 'extension',
    version: '1.0',
  });
  const root = document.createElement('div');
  const button = document.createElement('button');
  button.textContent = 'Check again';
  button.disabled = true;
  const clicked = vi.fn();
  button.addEventListener('click', clicked);
  root.append(button);
  document.body.append(root);
  const { startScenario } = await import('./bootstrap');
  startScenario(root);
  expect(clicked).not.toHaveBeenCalled();
  button.disabled = false;
  await Promise.resolve();
  expect(clicked).toHaveBeenCalledOnce();
  button.disabled = true;
  button.disabled = false;
  await Promise.resolve();
  expect(clicked).toHaveBeenCalledOnce();
});
