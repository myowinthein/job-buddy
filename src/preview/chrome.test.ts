import { afterEach, describe, expect, it, vi } from 'vitest';
import { createPreviewChrome } from './chrome';
import {
  getProfile,
  saveProfile,
  getThemePreference,
  saveThemePreference,
} from '@/src/utils/storage';
import { sessionGet, sessionRemove, sessionSet } from '@/src/utils/sessionStorage';

afterEach(() => vi.unstubAllGlobals());

describe('preview storage isolation', () => {
  it('remembers appearance across refreshes while profile changes stay in memory', async () => {
    const values = new Map<string, string>();
    const themeStorage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => {
        values.set(key, value);
      },
      removeItem: (key: string) => {
        values.delete(key);
      },
    };
    vi.stubGlobal('chrome', createPreviewChrome(undefined, themeStorage));
    await saveThemePreference('dark');
    const profile = (await getProfile())!;
    profile.personal.firstName = 'Temporary';
    await saveProfile(profile);
    vi.stubGlobal('chrome', createPreviewChrome(undefined, themeStorage));
    expect(await getThemePreference()).toBe('dark');
    expect((await getProfile())?.personal.firstName).toBe('Jane');
    expect(values.size).toBe(1);
  });

  it('can start empty without the development profile fallback', async () => {
    vi.stubGlobal('chrome', createPreviewChrome({ id: 'preview-empty' }));
    expect(await getProfile()).toEqual({ id: 'preview-empty' });
  });
  it('uses real profile save/load logic, without mutating the seed or another preview', async () => {
    const preview = createPreviewChrome();
    vi.stubGlobal('chrome', preview);
    const sample = await getProfile();
    expect(sample?.personal.firstName).toBe('Jane');
    if (!sample) throw new Error('Missing sample');

    sample.personal.firstName = 'Preview edit';
    expect((await getProfile())?.personal.firstName).toBe('Jane');
    await saveProfile(sample);
    sample.personal.firstName = 'Not saved';
    expect((await getProfile())?.personal.firstName).toBe('Preview edit');

    vi.stubGlobal('chrome', createPreviewChrome());
    expect((await getProfile())?.personal.firstName).toBe('Jane');
  });

  it('keeps local and session storage separate and emits the correct change events', async () => {
    const preview = createPreviewChrome();
    vi.stubGlobal('chrome', preview);
    const listener = vi.fn();
    preview.storage.onChanged.addListener(listener);
    await sessionSet({ profile: 'session only' });
    expect((await sessionGet('profile')).profile).toBe('session only');
    expect((await getProfile())?.personal.firstName).toBe('Jane');
    expect(listener).toHaveBeenCalledWith(
      { profile: { oldValue: undefined, newValue: 'session only' } },
      'session',
    );

    await sessionRemove('profile');
    expect(await sessionGet('profile')).toEqual({});
    expect(listener).toHaveBeenLastCalledWith({ profile: { oldValue: 'session only' } }, 'session');
    preview.storage.onChanged.removeListener(listener);
    listener.mockClear();
    await sessionSet({ another: true });
    expect(listener).not.toHaveBeenCalled();
  });

  it('provides no identity or extension messaging API', () => {
    const preview = createPreviewChrome();
    expect(preview).not.toHaveProperty('identity');
    expect(preview.runtime).not.toHaveProperty('sendMessage');
    expect(preview.runtime.lastError).toBeUndefined();
  });
});
