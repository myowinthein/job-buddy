// Wraps chrome.storage.session, mirroring storage.ts's chrome.storage.local
// wrapper pattern. Used from entrypoints/options/App.tsx and
// entrypoints/popup/App.tsx — content scripts cannot write to
// chrome.storage.session (blocked without host_permissions for the page URL).
// All three failure modes resolve rather than reject: every current caller
// treats session storage as best-effort and previously swallowed errors via
// try/catch, so this preserves that behavior instead of introducing new
// unhandled-rejection risk.

import { wrapStorageArea } from './storageArea';

const session = wrapStorageArea(() => chrome.storage.session, 'session');

export function sessionGet(key: string): Promise<Record<string, unknown>> {
  return session.get(key);
}

export function sessionSet(items: Record<string, unknown>): Promise<void> {
  return session.set(items);
}

export function sessionRemove(key: string): Promise<void> {
  return session.remove(key);
}
