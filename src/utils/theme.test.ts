// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./storage', () => ({
  getThemePreference: vi.fn(),
}));

import { applyTheme, getCurrentTheme, initTheme } from './theme';
import { getThemePreference } from './storage';

const mockGetTheme = vi.mocked(getThemePreference);

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
  // Reset theme module state between tests
  applyTheme('system');
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
});
