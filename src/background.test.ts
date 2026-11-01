import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/src/devtools/registerContentScript', () => ({
  registerDevelopmentContentScript: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/src/utils/driveSync', () => ({
  DRIVE_AUTH_ALARM: 'jb:drive-authorization-renewal',
  refreshDriveConnection: vi.fn().mockResolvedValue(undefined),
  DRIVE_RETRY_ALARM: 'jb:drive-backup-retry',
  markDriveBackupPending: vi.fn().mockResolvedValue(undefined),
  retryPendingDriveSync: vi.fn().mockResolvedValue(undefined),
  syncIfConnected: vi.fn().mockResolvedValue(undefined),
}));

const coordinatorMock = vi.hoisted(() => ({
  start: vi.fn().mockResolvedValue({ stage: 'completed' }),
  status: vi.fn().mockResolvedValue(null),
  confirm: vi.fn().mockResolvedValue(null),
  cancel: vi.fn().mockResolvedValue(undefined),
  navigated: vi.fn().mockResolvedValue(undefined),
  recover: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/src/autofill/runCoordinator', () => ({
  RUN_ALARM_PREFIX: 'jb:autofill-recover:',
  createAutofillCoordinator: () => coordinatorMock,
}));

// `entrypoints/background.ts` calls the real (auto-imported-by-WXT-at-build-time)
// `defineBackground` at module top level (`export default defineBackground(...)`).
// Vitest doesn't run WXT's auto-import plugin, so this global must be stubbed
// before the module is imported — via vi.hoisted, same reasoning as popup/App's
// chrome.runtime.getManifest() top-level read. defineBackground's actual
// implementation (wxt/dist/utils/define-background.mjs) is exactly this
// trivial, side-effect-free wrapper — inlined here rather than dynamically
// imported, since vi.hoisted's callback must stay synchronous.
const { onStartupAddListener, storageOnChangedAddListener, onAlarmAddListener } = vi.hoisted(() => {
  const onStartupAddListener = vi.fn();
  const storageOnChangedAddListener = vi.fn();
  const onAlarmAddListener = vi.fn();

  vi.stubGlobal('chrome', {
    alarms: { onAlarm: { addListener: onAlarmAddListener } },
    runtime: { id: 'job-buddy', getURL: (path: string) => `chrome-extension://job-buddy/${path}`, onStartup: { addListener: onStartupAddListener }, onMessage: { addListener: vi.fn() } },
    commands: { onCommand: { addListener: vi.fn() } },
    tabs: { onRemoved: { addListener: vi.fn() } },
    webNavigation: { onCommitted: { addListener: vi.fn() } },
    storage: { onChanged: { addListener: storageOnChangedAddListener } },
  });
  vi.stubGlobal('defineBackground', (arg: unknown) =>
    arg == null || typeof arg === 'function' ? { main: arg } : arg,
  );

  return { onStartupAddListener, storageOnChangedAddListener, onAlarmAddListener };
});

import background from '@/entrypoints/background';
import {
  retryPendingDriveSync,
  syncIfConnected,
  refreshDriveConnection,
  markDriveBackupPending,
} from '@/src/utils/driveSync';

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
    getStorageChangedListener()({ profile: { newValue: { id: 'p1' } } }, 'sync');
    await vi.advanceTimersByTimeAsync(6000);
    expect(vi.mocked(syncIfConnected)).not.toHaveBeenCalled();
  });

  it('ignores local changes that touch neither profile nor learnedMappings', async () => {
    getStorageChangedListener()({ geminiApiKey: {} }, 'local');
    await vi.advanceTimersByTimeAsync(6000);
    expect(vi.mocked(syncIfConnected)).not.toHaveBeenCalled();
  });

  it('syncs 5s after a profile change', async () => {
    getStorageChangedListener()({ profile: { newValue: { id: 'p1' } } }, 'local');
    await vi.advanceTimersByTimeAsync(4999);
    expect(vi.mocked(syncIfConnected)).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(vi.mocked(syncIfConnected)).toHaveBeenCalledTimes(1);
  });

  it('syncs 5s after a learnedMappings change', async () => {
    getStorageChangedListener()({ learnedMappings: { newValue: {} } }, 'local');
    await vi.advanceTimersByTimeAsync(5000);
    expect(vi.mocked(syncIfConnected)).toHaveBeenCalledTimes(1);
  });

  it('coalesces a burst of changes into a single sync, timed from the last change', async () => {
    const listener = getStorageChangedListener();
    listener({ profile: { newValue: { id: 'p1' } } }, 'local');
    await vi.advanceTimersByTimeAsync(3000);
    listener({ profile: { newValue: { id: 'p1' } } }, 'local'); // resets the timer
    await vi.advanceTimersByTimeAsync(3000); // 6s since the first change, but only 3s since the second
    expect(vi.mocked(syncIfConnected)).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(2000); // 5s since the second change
    expect(vi.mocked(syncIfConnected)).toHaveBeenCalledTimes(1);
  });

  it('a single burst touching both profile and learnedMappings together still syncs only once', async () => {
    getStorageChangedListener()(
      { profile: { newValue: { id: 'p1' } }, learnedMappings: { newValue: {} } },
      'local',
    );
    await vi.advanceTimersByTimeAsync(5000);
    expect(vi.mocked(syncIfConnected)).toHaveBeenCalledTimes(1);
  });
});

it('retries durable backups when the retry alarm fires', () => {
  onAlarmAddListener.mock.calls[0][0]({ name: 'jb:drive-backup-retry' });
  expect(retryPendingDriveSync).toHaveBeenCalledTimes(1);
});
it('renews the session before retrying pending data on the authorization alarm', async () => {
  onAlarmAddListener.mock.calls[0][0]({ name: 'jb:drive-authorization-renewal' });
  await Promise.resolve();
  expect(refreshDriveConnection).toHaveBeenCalledTimes(1);
  expect(retryPendingDriveSync).toHaveBeenCalledTimes(1);
});
it('does not back up removals during reset', async () => {
  getStorageChangedListener()(
    { profile: { oldValue: { id: 'old' } }, learnedMappings: { oldValue: {} } },
    'local',
  );
  await vi.advanceTimersByTimeAsync(6000);
  expect(markDriveBackupPending).not.toHaveBeenCalled();
  expect(syncIfConnected).not.toHaveBeenCalled();
});


describe('background autofill entry point', () => {
  const sender = { id: 'job-buddy', url: 'chrome-extension://job-buddy/popup.html' };
  const listener = () => vi.mocked(chrome.runtime.onMessage.addListener).mock.calls[0][0];
  it('keeps the response channel open while owning the popup request', async () => {
    const respond = vi.fn();
    expect(listener()({ action: 'AUTOFILL_RUN_START', tabId: 42 }, sender, respond)).toBe(true);
    expect(coordinatorMock.start).toHaveBeenCalledWith(42);
    await Promise.resolve();
    expect(respond).toHaveBeenCalledWith({ stage: 'completed' });
  });
  it('rejects content-page senders and invalid tab IDs', () => {
    listener()({ action: 'AUTOFILL_RUN_START', tabId: 42 }, { ...sender, url: 'https://example.test/' }, vi.fn());
    listener()({ action: 'AUTOFILL_RUN_START', tabId: -1 }, sender, vi.fn());
    expect(coordinatorMock.start).not.toHaveBeenCalled();
  });
  it('routes worker recovery and source navigation to the coordinator', () => {
    onAlarmAddListener.mock.calls[0][0]({ name: 'jb:autofill-recover:42' });
    expect(coordinatorMock.recover).toHaveBeenCalledWith(42);
    vi.mocked(chrome.webNavigation.onCommitted.addListener).mock.calls[0][0]({ tabId: 42, frameId: 0, documentId: 'new-document' } as chrome.webNavigation.WebNavigationTransitionCallbackDetails);
    expect(coordinatorMock.navigated).toHaveBeenCalledWith(42, 'new-document');
    vi.mocked(chrome.tabs.onRemoved.addListener).mock.calls[0][0](42, { windowId: 1, isWindowClosing: false });
    expect(coordinatorMock.cancel).toHaveBeenCalledWith(42);
  });
});
