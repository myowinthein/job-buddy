import { afterEach, expect, it, vi } from 'vitest';
import { createPreviewChrome } from '../preview/chrome';
import { getQuickFillPreferences, QUICK_FILL_KEY, updateQuickFillPreferences } from './preferences';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('preserves concurrent Quick Fill position and Settings changes', async () => {
  const preview = createPreviewChrome({}, undefined, {
    initialData: {
      [QUICK_FILL_KEY]: {
        enabled: true,
        fillMode: 'merge',
        disabledSites: ['existing.example'],
      },
    },
  });
  vi.stubGlobal('chrome', preview);
  let queue = Promise.resolve<unknown>(undefined);
  const request = vi.fn((_name: string, action: () => Promise<unknown>) => {
    const pending = queue.then(action);
    queue = pending.catch(() => {});
    return pending;
  });
  vi.stubGlobal('navigator', { locks: { request } });
  const read = vi.spyOn(preview.storage.local, 'get');
  const originalSet = preview.storage.local.set;
  let release!: () => void;
  let entered!: () => void;
  const writing = new Promise<void>((resolve) => { entered = resolve; });
  vi.spyOn(preview.storage.local, 'set').mockImplementationOnce((items, callback) => {
    release = () => originalSet(items, callback);
    entered();
  });

  const position = { x: 0.25, y: 0.75 };
  const moving = updateQuickFillPreferences({ position });
  await writing;
  const settings = updateQuickFillPreferences((current) => ({
    enabled: false,
    disabledSites: [...current.disabledSites, 'hidden.example'],
  }));
  try {
    expect(request).toHaveBeenCalledTimes(2);
    expect(request.mock.calls.map(([name]) => name)).toEqual([
      'jb:quick-fill-preferences',
      'jb:quick-fill-preferences',
    ]);
    expect(read).toHaveBeenCalledTimes(1);
  } finally {
    release();
    await Promise.all([moving, settings]);
  }

  expect(await getQuickFillPreferences()).toEqual({
    enabled: false,
    fillMode: 'merge',
    disabledSites: ['existing.example', 'hidden.example'],
    position,
  });
});
