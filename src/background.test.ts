import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/src/utils/driveSync', () => ({
  retryPendingDriveSync: vi.fn().mockResolvedValue(undefined),
  syncIfConnected: vi.fn().mockResolvedValue(undefined),
}));

// `entrypoints/background.ts` calls the real (auto-imported-by-WXT-at-build-time)
// `defineBackground` at module top level (`export default defineBackground(...)`).
// Vitest doesn't run WXT's auto-import plugin, so this global must be stubbed
// before the module is imported — via vi.hoisted, same reasoning as popup/App's
// chrome.runtime.getManifest() top-level read. defineBackground's actual
// implementation (wxt/dist/utils/define-background.mjs) is exactly this
// trivial, side-effect-free wrapper — inlined here rather than dynamically
// imported, since vi.hoisted's callback must stay synchronous.
const { onStartupAddListener, storageOnChangedAddListener } = vi.hoisted(() => {
  const onStartupAddListener = vi.fn();
  const storageOnChangedAddListener = vi.fn();

  vi.stubGlobal('chrome', {
    runtime: { onStartup: { addListener: onStartupAddListener } },
    storage: { onChanged: { addListener: storageOnChangedAddListener } },
  });
  vi.stubGlobal('defineBackground', (arg: unknown) =>
    (arg == null || typeof arg === 'function') ? { main: arg } : arg);

  return { onStartupAddListener, storageOnChangedAddListener };
});

import background from '@/entrypoints/background';
import { retryPendingDriveSync, syncIfConnected } from '@/src/utils/driveSync';

function getOnStartupListener(): () => void {
  return onStartupAddListener.mock.calls[0][0];
}
function getStorageChangedListener(): (changes: object, areaName: string) => void {
  return storageOnChangedAddListener.mock.calls[0][0];
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  background.main?.();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('background — onStartup retries pending Drive sync', () => {
  it('calls retryPendingDriveSync when the browser starts up', () => {
    getOnStartupListener()();
    expect(vi.mocked(retryPendingDriveSync)).toHaveBeenCalledTimes(1);
  });
});

describe('background — debounced sync on storage changes', () => {
  it('ignores changes outside the "local" storage area', async () => {
    getStorageChangedListener()({ profile: {} }, 'sync');
    await vi.advanceTimersByTimeAsync(6000);
    expect(vi.mocked(syncIfConnected)).not.toHaveBeenCalled();
  });

  it('ignores local changes that touch neither profile nor learnedMappings', async () => {
    getStorageChangedListener()({ geminiApiKey: {} }, 'local');
    await vi.advanceTimersByTimeAsync(6000);
    expect(vi.mocked(syncIfConnected)).not.toHaveBeenCalled();
  });

  it('syncs 5s after a profile change', async () => {
    getStorageChangedListener()({ profile: {} }, 'local');
    await vi.advanceTimersByTimeAsync(4999);
    expect(vi.mocked(syncIfConnected)).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(vi.mocked(syncIfConnected)).toHaveBeenCalledTimes(1);
  });

  it('syncs 5s after a learnedMappings change', async () => {
    getStorageChangedListener()({ learnedMappings: {} }, 'local');
    await vi.advanceTimersByTimeAsync(5000);
    expect(vi.mocked(syncIfConnected)).toHaveBeenCalledTimes(1);
  });

  it('coalesces a burst of changes into a single sync, timed from the last change', async () => {
    const listener = getStorageChangedListener();
    listener({ profile: {} }, 'local');
    await vi.advanceTimersByTimeAsync(3000);
    listener({ profile: {} }, 'local'); // resets the timer
    await vi.advanceTimersByTimeAsync(3000); // 6s since the first change, but only 3s since the second
    expect(vi.mocked(syncIfConnected)).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(2000); // 5s since the second change
    expect(vi.mocked(syncIfConnected)).toHaveBeenCalledTimes(1);
  });

  it('a single burst touching both profile and learnedMappings together still syncs only once', async () => {
    getStorageChangedListener()({ profile: {}, learnedMappings: {} }, 'local');
    await vi.advanceTimersByTimeAsync(5000);
    expect(vi.mocked(syncIfConnected)).toHaveBeenCalledTimes(1);
  });
});
