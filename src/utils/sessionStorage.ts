// Wraps chrome.storage.session, mirroring storage.ts's chrome.storage.local
// wrapper pattern. Used from entrypoints/options/App.tsx and
// entrypoints/popup/App.tsx — content scripts cannot write to
// chrome.storage.session (blocked without host_permissions for the page URL).
// All three failure modes resolve rather than reject: every current caller
// treats session storage as best-effort and previously swallowed errors via
// try/catch, so this preserves that behavior instead of introducing new
// unhandled-rejection risk.

export function sessionGet(key: string): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    try {
      chrome.storage.session.get(key, (result: Record<string, unknown>) => {
        if (chrome.runtime.lastError) {
          console.error('[Job Buddy] session.get error:', chrome.runtime.lastError.message);
          resolve({});
          return;
        }
        resolve(result);
      });
    } catch (err) {
      console.error('[Job Buddy] session.get threw:', err);
      resolve({});
    }
  });
}

export function sessionSet(items: Record<string, unknown>): Promise<void> {
  return new Promise((resolve) => {
    try {
      chrome.storage.session.set(items, () => {
        if (chrome.runtime.lastError) {
          console.error('[Job Buddy] session.set error:', chrome.runtime.lastError.message);
        }
        resolve();
      });
    } catch (err) {
      console.error('[Job Buddy] session.set threw:', err);
      resolve();
    }
  });
}

export function sessionRemove(key: string): Promise<void> {
  return new Promise((resolve) => {
    try {
      chrome.storage.session.remove(key, () => {
        if (chrome.runtime.lastError) {
          console.error('[Job Buddy] session.remove error:', chrome.runtime.lastError.message);
        }
        resolve();
      });
    } catch (err) {
      console.error('[Job Buddy] session.remove threw:', err);
      resolve();
    }
  });
}
