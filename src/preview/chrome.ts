import { DEV_PROFILE } from '@/src/utils/devProfile';

type ChangeListener = (
  changes: Record<string, chrome.storage.StorageChange>,
  areaName: string,
) => void;

/** Only the storage surface used by Options; no connection to extension APIs. */
export function createPreviewChrome() {
  const listeners = new Set<ChangeListener>();

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
      local: area('local', { profile: DEV_PROFILE }),
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
