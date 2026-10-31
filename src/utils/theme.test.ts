// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./storage', () => ({
  getThemePreference: vi.fn(),
}));

import { applyTheme, getCurrentTheme, initTheme, subscribeTheme } from './theme';
import { getThemePreference } from './storage';

const mockGetTheme = vi.mocked(getThemePreference);
let storageEvents: { addListener: ReturnType<typeof vi.fn>; removeListener: ReturnType<typeof vi.fn> };

function stubMatchMedia(prefersDark: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockReturnValue({
      matches: prefersDark,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }),
  });
}

beforeEach(() => {
  document.documentElement.classList.remove('dark');
  vi.clearAllMocks();
  storageEvents = { addListener: vi.fn(), removeListener: vi.fn() };
  vi.stubGlobal('chrome', { storage: { onChanged: storageEvents } });
  // Reset theme module state between tests. Use 'light' (never touches
  // matchMedia) so the reset can't hit real jsdom matchMedia before a test's
  // stubMatchMedia is installed.
  applyTheme('light');
  document.documentElement.classList.remove('dark');
});

describe('getCurrentTheme', () => {
  it('returns the last applied preference', () => {
    applyTheme('dark');
    expect(getCurrentTheme()).toBe('dark');

    applyTheme('light');
    expect(getCurrentTheme()).toBe('light');

    applyTheme('system');
    expect(getCurrentTheme()).toBe('system');
  });
});

describe('applyTheme("dark")', () => {
  it('adds dark class to documentElement', () => {
    applyTheme('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('adds dark class even if light was previously applied', () => {
    applyTheme('light');
    applyTheme('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });
});

describe('applyTheme("light")', () => {
  it('removes dark class from documentElement', () => {
    document.documentElement.classList.add('dark');
    applyTheme('light');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });
});

describe('applyTheme("system")', () => {
  it('applies dark class when OS prefers dark', () => {
    stubMatchMedia(true);
    applyTheme('system');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('removes dark class when OS prefers light', () => {
    document.documentElement.classList.add('dark');
    stubMatchMedia(false);
    applyTheme('system');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  it('reacts live to an OS color-scheme change while "system" is active', () => {
    stubMatchMedia(false);
    applyTheme('system');
    expect(document.documentElement.classList.contains('dark')).toBe(false);

    const mq = vi.mocked(window.matchMedia).mock.results[0].value;
    const listener = vi.mocked(mq.addEventListener).mock.calls[0][1];
    listener({ matches: true } as MediaQueryListEvent);

    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });
});

describe('initTheme', () => {
  it('applies the preference from storage', async () => {
    mockGetTheme.mockResolvedValue('dark');
    await initTheme();
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('falls back to system when storage throws', async () => {
    mockGetTheme.mockRejectedValue(new Error('storage unavailable'));
    await initTheme();
    expect(getCurrentTheme()).toBe('system');
  });

  it('updates open pages and subscribers after a local storage change', async () => {
    mockGetTheme.mockResolvedValue('light');
    await initTheme();
    const changed = storageEvents.addListener.mock.calls[0][0];
    const subscriber = vi.fn();
    const unsubscribe = subscribeTheme(subscriber);
    changed({ themePreference: { newValue: 'dark' } }, 'local');
    expect(getCurrentTheme()).toBe('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(subscriber).toHaveBeenCalledOnce();
    unsubscribe();
    changed({ themePreference: { newValue: 'light' } }, 'local');
    expect(subscriber).toHaveBeenCalledOnce();
  });

  it('uses system appearance when the preference is removed and ignores other storage changes', async () => {
    stubMatchMedia(true);
    mockGetTheme.mockResolvedValue('light');
    await initTheme();
    const changed = storageEvents.addListener.mock.calls[0][0];
    changed({ themePreference: { newValue: 'dark' } }, 'session');
    changed({ profile: {} }, 'local');
    expect(getCurrentTheme()).toBe('light');
    changed({ themePreference: {} }, 'local');
    expect(getCurrentTheme()).toBe('system');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('does not overwrite a newer theme change with a stale initial read', async () => {
    let resolve!: (value: 'light') => void;
    mockGetTheme.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
    const initial = initTheme();
    storageEvents.addListener.mock.calls[0][0]({ themePreference: { newValue: 'dark' } }, 'local');
    resolve('light');
    await initial;
    expect(getCurrentTheme()).toBe('dark');
  });

  it('registers one storage listener across repeated initialization', async () => {
    mockGetTheme.mockResolvedValue('light');
    await initTheme();
    await initTheme();
    expect(storageEvents.addListener).toHaveBeenCalledOnce();
  });
});
