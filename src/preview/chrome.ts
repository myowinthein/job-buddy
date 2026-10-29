import type { Profile } from '@/src/types/profile';
import { DEV_PROFILE } from '@/src/utils/devProfile';

type ChangeListener = (
  changes: Record<string, chrome.storage.StorageChange>,
  areaName: string,
) => void;

/** Only the storage surface used by Options; no connection to extension APIs. */
type ThemeStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
const PREVIEW_THEME_KEY = 'jb:preview:themePreference';

export function createPreviewChrome(
  seed: Partial<Profile> = DEV_PROFILE,
  themeStorage?: ThemeStorage,
) {
  const listeners = new Set<ChangeListener>();
  let themePreference: string | null = null;
  try {
    themePreference = themeStorage?.getItem(PREVIEW_THEME_KEY) ?? null;
  } catch {
    /* Memory-only fallback. */
  }

  function persistTheme(value?: unknown) {
    try {
      if (typeof value === 'string') themeStorage?.setItem(PREVIEW_THEME_KEY, value);
      else themeStorage?.removeItem(PREVIEW_THEME_KEY);
    } catch {
      /* Preference persistence is unavailable; sample data stays in memory. */
    }
  }

  function area(areaName: string, seed: Record<string, unknown> = {}) {
    const data = structuredClone(seed);
    return {
      get(key: string, callback: (result: Record<string, unknown>) => void) {
        queueMicrotask(() => callback(key in data ? { [key]: structuredClone(data[key]) } : {}));
      },
      set(items: Record<string, unknown>, callback: () => void) {
        const changes: Record<string, chrome.storage.StorageChange> = {};
        for (const [key, value] of Object.entries(items)) {
          changes[key] = { oldValue: structuredClone(data[key]), newValue: structuredClone(value) };
          data[key] = structuredClone(value);
          if (areaName === 'local' && key === 'themePreference') persistTheme(value);
        }
        queueMicrotask(() => {
          callback();
          for (const listener of listeners) listener(structuredClone(changes), areaName);
        });
      },
      remove(keys: string | string[], callback: () => void) {
        const changes: Record<string, chrome.storage.StorageChange> = {};
        for (const key of typeof keys === 'string' ? [keys] : keys) {
          if (!(key in data)) continue;
          changes[key] = { oldValue: structuredClone(data[key]) };
          delete data[key];
          if (areaName === 'local' && key === 'themePreference') persistTheme();
        }
        queueMicrotask(() => {
          callback();
          if (Object.keys(changes).length) {
            for (const listener of listeners) listener(structuredClone(changes), areaName);
          }
        });
      },
    };
  }

  return {
    runtime: { lastError: undefined },
    storage: {
      local: area('local', {
        profile: seed,
        ...(['system', 'light', 'dark'].includes(themePreference ?? '') ? { themePreference } : {}),
      }),
      session: area('session'),
      onChanged: {
        addListener: (listener: ChangeListener) => {
          listeners.add(listener);
        },
        removeListener: (listener: ChangeListener) => {
          listeners.delete(listener);
        },
      },
    },
  };
}
