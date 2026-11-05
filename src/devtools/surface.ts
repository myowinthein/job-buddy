import { devContext, devLockName, type DevContext } from './context';
import { getSimulation } from './bootstrap';
import {
  exitPreviewUrl,
  preparePreview,
  previewUrl,
  readQuickPreview,
  type PreviewPreset,
} from './quickPreview';
import {
  clearGeminiSettings,
  getGeminiSettings,
  saveGeminiSettings,
  type GeminiSettings,
} from '@/src/utils/storage';
import { DEFAULT_GEMINI_MODEL } from '@/src/resume-ai/types';
import { wrapStorageArea } from '@/src/utils/storageArea';

export interface SurfaceState {
  context?: DevContext;
  preset?: PreviewPreset;
  missingKey: boolean;
  driveConnected: boolean;
}

export interface DevSurface {
  state(): Promise<SurfaceState>;
  canLeave(): boolean;
  prepare(preset: PreviewPreset, missingKey: boolean, driveConnected?: boolean): Promise<string>;
  setKeyEnabled(enabled: boolean): Promise<void>;
  setDriveConnected(connected: boolean): Promise<void>;
  exitUrl(): string;
  subscribe(listener: () => void): () => void;
}

declare global {
  interface Window {
    __JB_DEV_SURFACE__?: DevSurface;
  }
}

/** Each surface keeps its own Chrome APIs, provider mocks, and pending work. */
export function createDevSurface(): DevSurface {
  let previousKey: GeminiSettings | null = null;
  return {
    async state() {
      const context = devContext();
      const quick = readQuickPreview();
      const local = wrapStorageArea(() => chrome.storage.local, 'development controls');
      const data = await local.get(['geminiApiKey', 'driveToken'], { rejectOnError: true });
      return {
        context,
        preset: quick?.preset,
        missingKey: !data.geminiApiKey,
        driveConnected: !!data.driveToken,
      };
    },
    canLeave() {
      const event = new Event('beforeunload', { cancelable: true });
      window.dispatchEvent(event);
      return (
        !event.defaultPrevented ||
        window.confirm('You have unsaved changes. Switch test data and discard them?')
      );
    },
    async prepare(preset, missingKey, driveConnected = false) {
      const seed = await preparePreview(preset);
      return previewUrl(preset, missingKey, seed, driveConnected);
    },
    async setKeyEnabled(enabled) {
      // A live surface must enter an isolated copy before changing credentials.
      if (!readQuickPreview() || !getSimulation()) throw new Error('Temporary data is required');
      const settings = await getGeminiSettings();
      if (!!settings.apiKey === enabled) return;
      if (!enabled) {
        previousKey = settings;
        await clearGeminiSettings();
      } else {
        const result = await saveGeminiSettings(
          previousKey?.apiKey ?? 'simulated-key',
          previousKey?.model ?? DEFAULT_GEMINI_MODEL,
          previousKey?.preference ?? 'auto',
          settings.revision,
        );
        if (!result) throw new Error('Temporary key changed');
      }
      const url = new URL(location.href);
      if ((await getGeminiSettings()).apiKey) url.searchParams.delete('devNoKey');
      else url.searchParams.set('devNoKey', '1');
      history.replaceState(history.state, '', url);
      window.dispatchEvent(new Event('jb:dev:integration-state'));
    },
    async setDriveConnected(connected) {
      const simulation = getSimulation();
      if (!readQuickPreview() || !simulation) throw new Error('Temporary data is required');
      // Coordinate injected state with any simulated upload already in progress.
      const update = () => simulation.setDriveConnected(connected);
      if (typeof navigator !== 'undefined' && navigator.locks)
        await navigator.locks.request(devLockName('job-buddy:drive-backup'), update);
      else await update();
      const url = new URL(location.href);
      if (connected) url.searchParams.set('devDrive', '1');
      else url.searchParams.delete('devDrive');
      history.replaceState(history.state, '', url);
      window.dispatchEvent(new Event('jb:dev:integration-state'));
    },
    exitUrl: exitPreviewUrl,
    subscribe(listener) {
      const events = chrome.storage.onChanged;
      const changed = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
        if (
          area === 'local' &&
          ['geminiApiKey', 'geminiSettingsMeta', 'driveToken', 'driveBackupState'].some(
            (key) => key in changes,
          )
        )
          listener();
      };
      events.addListener(changed);
      window.addEventListener('jb:dev:integration-state', listener);
      return () => {
        events.removeListener(changed);
        window.removeEventListener('jb:dev:integration-state', listener);
      };
    },
  };
}
