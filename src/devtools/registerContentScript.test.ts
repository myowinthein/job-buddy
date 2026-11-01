import { beforeEach, expect, it, vi } from 'vitest';
import { DEV_CONTENT_SCRIPT_ID, registerDevelopmentContentScript } from './registerContentScript';

const scripting = {
  getRegisteredContentScripts: vi.fn(),
  registerContentScripts: vi.fn(),
  updateContentScripts: vi.fn(),
};
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal('chrome', { scripting });
  scripting.getRegisteredContentScripts.mockResolvedValue([]);
  scripting.registerContentScripts.mockResolvedValue(undefined);
  scripting.updateContentScripts.mockResolvedValue(undefined);
});
it('registers on startup without the dev server, including embedded origin-fallback frames', async () => {
  await registerDevelopmentContentScript();
  expect(scripting.registerContentScripts).toHaveBeenCalledWith([
    {
      id: DEV_CONTENT_SCRIPT_ID,
      matches: ['*://*/*'],
      js: ['content-scripts/content.js'],
      allFrames: true,
      matchOriginAsFallback: true,
      runAt: 'document_idle',
      persistAcrossSessions: true,
    },
  ]);
});
it('updates the existing WXT registration without duplicating it', async () => {
  scripting.getRegisteredContentScripts.mockResolvedValue([{ id: DEV_CONTENT_SCRIPT_ID }]);
  await registerDevelopmentContentScript();
  expect(scripting.updateContentScripts).toHaveBeenCalledOnce();
  expect(scripting.registerContentScripts).not.toHaveBeenCalled();
});
it('handles WXT registering the same script concurrently', async () => {
  scripting.registerContentScripts.mockRejectedValue(new Error('Duplicate script ID'));
  scripting.getRegisteredContentScripts
    .mockResolvedValueOnce([])
    .mockResolvedValueOnce([{ id: DEV_CONTENT_SCRIPT_ID }]);
  await registerDevelopmentContentScript();
  expect(scripting.updateContentScripts).toHaveBeenCalledOnce();
});
it('surfaces a real registration failure rather than treating it as a duplicate', async () => {
  scripting.registerContentScripts.mockRejectedValue(new Error('Permission denied'));
  await expect(registerDevelopmentContentScript()).rejects.toThrow('Permission denied');
  expect(scripting.updateContentScripts).not.toHaveBeenCalled();
});
