import { getThemePreference } from './storage';

export type ThemePreference = 'system' | 'light' | 'dark';

// Tracks the last value passed to applyTheme so components can read it
// synchronously — avoids a storage round-trip on every mount.
let currentPreference: ThemePreference = 'system';
let revision = 0;
const subscribers = new Set<() => void>();

export function subscribeTheme(listener: () => void): () => void {
  subscribers.add(listener);
  return () => { subscribers.delete(listener); };
}

let storageEvents: typeof chrome.storage.onChanged | undefined;
const onStorageChange = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
  if (area !== 'local' || !('themePreference' in changes)) return;
  const value: unknown = changes.themePreference.newValue;
  applyTheme(value === 'light' || value === 'dark' ? value : 'system');
};

function watchThemePreference(): void {
  const events = typeof chrome !== 'undefined' ? chrome.storage?.onChanged : undefined;
  if (events === storageEvents) return;
  storageEvents?.removeListener(onStorageChange);
  storageEvents = events;
  storageEvents?.addListener(onStorageChange);
}

/** Returns the preference that was last passed to applyTheme. */
export function getCurrentTheme(): ThemePreference {
  return currentPreference;
}

// Module-level references so we can tear down the previous listener before
// setting a new one when the user switches preference.
let activeMediaQuery: MediaQueryList | null = null;
let activeListener:   ((e: MediaQueryListEvent) => void) | null = null;

function removeMediaListener(): void {
  if (activeMediaQuery && activeListener) {
    try {
      activeMediaQuery.removeEventListener('change', activeListener);
    } catch { /* no-op */ }
    activeMediaQuery = null;
    activeListener   = null;
  }
}

function setDarkClass(dark: boolean): void {
  try {
    document.documentElement.classList.toggle('dark', dark);
  } catch { /* no-op if document unavailable (service worker context) */ }
}

export function applyTheme(preference: ThemePreference): void {
  revision++;
  const changed = currentPreference !== preference;
  currentPreference = preference;
  removeMediaListener();

  if (changed) subscribers.forEach(listener => listener());

  if (preference === 'dark') {
    setDarkClass(true);
    return;
  }
  if (preference === 'light') {
    setDarkClass(false);
    return;
  }
  // 'system' — mirror OS preference and watch for live changes
  try {
    const mq       = window.matchMedia('(prefers-color-scheme: dark)');
    const listener = (e: MediaQueryListEvent) => setDarkClass(e.matches);
    setDarkClass(mq.matches);
    mq.addEventListener('change', listener);
    activeMediaQuery = mq;
    activeListener   = listener;
  } catch { /* no-op if matchMedia unavailable */ }
}

export async function initTheme(): Promise<void> {
  watchThemePreference();
  const startedAt = revision;
  try {
    const preference = await getThemePreference();
    if (revision === startedAt) applyTheme(preference);
  } catch {
    if (revision === startedAt) applyTheme('system');
  }
}
