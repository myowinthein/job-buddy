// Shared wrapper factory for a chrome.storage.* area (local or session),
// used by storage.ts and sessionStorage.ts. Both wrap the same
// callback-based chrome.storage.StorageArea API with the same
// try/catch-and-resolve shape; the only real difference between them is
// whether a set() failure rejects (storage.ts, so callers can surface an
// error) or resolves silently (sessionStorage.ts, since every current
// caller already treats session storage as best-effort).

interface WrapStorageAreaOptions {
  rejectOnSetError?: boolean;
}

export function wrapStorageArea(
  getArea: () => chrome.storage.StorageArea,
  label: string,
  { rejectOnSetError = false }: WrapStorageAreaOptions = {},
) {
  function get(key: string): Promise<Record<string, unknown>> {
    return new Promise((resolve) => {
      try {
        getArea().get(key, (result: Record<string, unknown>) => {
          if (chrome.runtime.lastError) {
            console.error(`[Job Buddy] ${label}.get error:`, chrome.runtime.lastError.message);
            resolve({});
            return;
          }
          resolve(result);
        });
      } catch (err) {
        console.error(`[Job Buddy] ${label}.get threw:`, err);
        resolve({});
      }
    });
  }

  function set(items: Record<string, unknown>): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        getArea().set(items, () => {
          if (chrome.runtime.lastError) {
            const msg = chrome.runtime.lastError.message ?? `${label}.set failed`;
            console.error(`[Job Buddy] ${label}.set error:`, msg);
            if (rejectOnSetError) { reject(new Error(msg)); return; }
            resolve();
            return;
          }
          resolve();
        });
      } catch (err) {
        console.error(`[Job Buddy] ${label}.set threw:`, err);
        if (rejectOnSetError) reject(err as Error);
        else resolve();
      }
    });
  }

  function remove(keys: string | string[]): Promise<void> {
    return new Promise((resolve) => {
      try {
        getArea().remove(keys, () => {
          if (chrome.runtime.lastError) {
            console.error(`[Job Buddy] ${label}.remove error:`, chrome.runtime.lastError.message);
          }
          resolve();
        });
      } catch (err) {
        console.error(`[Job Buddy] ${label}.remove threw:`, err);
        resolve();
      }
    });
  }

  return { get, set, remove };
}
