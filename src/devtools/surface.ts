import { devContext, type DevContext } from './context';
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

export interface SurfaceState {
  context?: DevContext;
  preset?: PreviewPreset;
  missingKey: boolean;
}

export interface DevSurface {
  state(): Promise<SurfaceState>;
  canLeave(): boolean;
  prepare(preset: PreviewPreset, missingKey: boolean): Promise<string>;
  toggleKey(): Promise<void>;
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
      return {
        context,
        preset: quick?.preset,
        missingKey: context ? !(await getGeminiSettings()).apiKey : false,
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
    async prepare(preset, missingKey) {
      const seed = await preparePreview(preset);
      return previewUrl(preset, missingKey, seed);
    },
    async toggleKey() {
      // A live surface must enter an isolated copy before changing credentials.
      if (!readQuickPreview() || !getSimulation()) throw new Error('Temporary data is required');
      const settings = await getGeminiSettings();
      if (settings.apiKey) {
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
      window.dispatchEvent(new Event('jb:dev:key-state'));
    },
    exitUrl: exitPreviewUrl,
    subscribe(listener) {
      const events = chrome.storage.onChanged;
      const changed = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
        if (area === 'local' && ('geminiApiKey' in changes || 'geminiSettingsMeta' in changes))
          listener();
      };
      events.addListener(changed);
      window.addEventListener('jb:dev:key-state', listener);
      return () => {
        events.removeListener(changed);
        window.removeEventListener('jb:dev:key-state', listener);
      };
    },
  };
}
