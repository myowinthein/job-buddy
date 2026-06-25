import { getThemePreference } from './storage';

export type ThemePreference = 'system' | 'light' | 'dark';

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
  removeMediaListener();

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
  try {
    const preference = await getThemePreference();
    applyTheme(preference);
  } catch {
    applyTheme('system');
  }
}
