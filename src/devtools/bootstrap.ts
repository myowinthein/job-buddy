import { DevSimulation } from './simulation';
import { profilePreset } from './profilePresets';
import { cleanupPreviewSeeds, loadPreviewSeed, readQuickPreview } from './quickPreview';

let simulation: DevSimulation | undefined;
export const getSimulation = () => simulation;

export function initializeDevPreview() {
  if (!import.meta.env.DEV) return;
  let stopBackground = () => {};
  const params = new URLSearchParams(location.search);
  const quick = readQuickPreview();
  if (quick) {
    const extensionId = chrome.runtime.id ?? 'localhost-preview';
    const version = chrome.runtime.getManifest?.().version ?? 'preview';
    const seed = loadPreviewSeed(quick);
    const instance = new DevSimulation(extensionId, version, {
      ...seed,
      profile: seed.profile ?? profilePreset(quick.preset === 'saved' ? 'complete' : quick.preset),
      noKey: quick.missingKey,
      driveConnected: quick.driveConnected,
    });
    // A fresh document gets an isolated Chrome surface before app modules load.
    // Never swap storage beneath an already-running live App.
    Object.defineProperty(window, 'chrome', { configurable: true, value: instance.chrome });
    globalThis.__JB_DEV_CONTEXT__ = {
      id: crypto.randomUUID(),
      extensionId,
      version,
      quickPreview: quick.preset,
    };
    simulation = instance;
    const originalFetch = window.fetch.bind(window);
    window.fetch = (input, init) => {
      const url = new URL(
        typeof input === 'string' || input instanceof URL ? String(input) : input.url,
        location.href,
      );
      // Local assets still work; every provider request is answered in memory.
      if (url.origin === location.origin) return originalFetch(input, init);
      return instance.fetch(input, init);
    };
    instance.onAlarm = async (name) => {
      const drive = await import('@/src/utils/driveSync');
      if (name === drive.DRIVE_RETRY_ALARM) await drive.retryPendingDriveSync();
      if (name === drive.DRIVE_AUTH_ALARM) await drive.refreshDriveConnection();
    };
    let syncTimer: ReturnType<typeof setTimeout> | undefined;
    const changed = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (
        area !== 'local' ||
        (changes.profile?.newValue == null && changes.learnedMappings?.newValue == null)
      )
        return;
      clearTimeout(syncTimer);
      void import('@/src/utils/driveSync').then((drive) => drive.markDriveBackupPending());
      syncTimer = setTimeout(() => {
        void import('@/src/utils/driveSync').then((drive) => drive.syncIfConnected());
      }, 5_000);
    };
    instance.chrome.storage.onChanged.addListener(changed);
    stopBackground = () => {
      clearTimeout(syncTimer);
      instance.chrome.storage.onChanged.removeListener(changed);
      instance.dispose();
    };
  }
  // The host keeps the current seed until the replacement surface is ready.
  if (!params.has('devEmbedded')) cleanupPreviewSeeds(quick?.seedId ?? null);
  const stop = () => {
    stopBackground();
    window.removeEventListener('pagehide', stop);
  };
  window.addEventListener('pagehide', stop, { once: true });
  return stop;
}
