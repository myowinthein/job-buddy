import { beforeEach, describe, it, expect, vi } from 'vitest';

// Mock chrome.storage.local before importing the module under test.
// We use a simple in-memory store so all helpers work together correctly.
const store: Record<string, unknown> = {};

vi.stubGlobal('chrome', {
  storage: {
    local: {
      get(key: string, callback: (result: Record<string, unknown>) => void) {
        callback({ [key]: store[key] });
      },
      set(items: Record<string, unknown>, callback: () => void) {
        Object.assign(store, items);
        callback();
      },
      remove(keys: string[], callback: () => void) {
        for (const k of keys) delete store[k];
        callback();
      },
    },
  },
  runtime: { lastError: null },
});

// Import after the global is stubbed
import {
  getProfile, saveProfile,
  getLearnedMappings, saveLearnedMapping, mergeLearnedMappings,
  getApplicationHistory, saveApplicationHistory,
  getGeminiApiKey, saveGeminiApiKey, clearGeminiSettings,
  getGeminiModel, saveGeminiModel,
  getThemePreference, saveThemePreference,
  getDriveToken, saveDriveToken, clearDriveToken,
  clearAllStorage,
} from './storage';
import type { Profile } from '../types/profile';
import type { LearnedMappings } from '../types/storage';

const MINIMAL_PROFILE: Profile = {
  id: 'test-id',
  personal: {
    firstName: 'Jane', lastName: 'Doe',
    email: 'jane@example.com',
    phone: { countryCode: 'TH', callingCode: '+66', number: '812345678' },
  },
  address: { city: 'Bangkok', country: 'TH' },
  professional: {},
  salary: { current: { amount: 50000, currency: 'THB', period: 'monthly' }, expected: [] },
  workAuthorization: [],
  workHistory: [],
  education: [],
  languages: [],
  links: { linkedin: 'https://linkedin.com/in/jane' },
  documents: { cv: {} },
};

beforeEach(() => {
  // Clear the in-memory store between tests
  for (const key of Object.keys(store)) delete store[key];
  vi.clearAllMocks();
});

describe('profile storage', () => {
  it('returns null when no profile is stored (production — DEV fallback does not apply)', async () => {
    vi.stubEnv('DEV', false);
    expect(await getProfile()).toBeNull();
    vi.unstubAllEnvs();
  });

  it('returns the dev fallback profile when no profile is stored and DEV is true', async () => {
    expect(await getProfile()).toMatchObject({ id: 'dev-profile', personal: { firstName: 'Jane' } });
  });

  it('saves and retrieves a profile', async () => {
    await saveProfile(MINIMAL_PROFILE);
    const result = await getProfile();
    expect(result?.personal.firstName).toBe('Jane');
  });

  it('auto-backfills a missing id on retrieval', async () => {
    const profileWithoutId = { ...MINIMAL_PROFILE, id: '' };
    store['profile'] = profileWithoutId;
    const result = await getProfile();
    expect(result?.id).toBeTruthy();
    expect(result?.id.length).toBeGreaterThan(0);
  });

  it('migrates a stored profile missing salary.current.period to "monthly"', async () => {
    store['profile'] = {
      ...MINIMAL_PROFILE,
      salary: {
        current: { amount: 50000, currency: 'THB' },
        expected: [],
      },
    };
    const result = await getProfile();
    expect(result?.salary.current.period).toBe('monthly');
    // The migrated profile is also written back so subsequent reads are clean
    const stored = store['profile'] as { salary: { current: { period?: string } } };
    expect(stored.salary.current.period).toBe('monthly');
  });

  it('migrates expected salary entries missing period', async () => {
    store['profile'] = {
      ...MINIMAL_PROFILE,
      salary: {
        current: { amount: 50000, currency: 'THB', period: 'monthly' },
        expected: [
          { country: 'SG', currency: 'SGD', amount: 100000 },
        ],
      },
    };
    const result = await getProfile();
    expect(result?.salary.expected[0]?.period).toBe('monthly');
  });

  it('saveProfile defaults a missing period before writing', async () => {
    const partialPeriod = {
      ...MINIMAL_PROFILE,
      salary: {
        current: { amount: 50000, currency: 'THB' },
        expected: [],
      },
    } as unknown as typeof MINIMAL_PROFILE;
    await saveProfile(partialPeriod);
    const stored = store['profile'] as { salary: { current: { period?: string } } };
    expect(stored.salary.current.period).toBe('monthly');
  });
});

describe('learned mappings', () => {
  it('returns empty object when no mappings are stored', async () => {
    expect(await getLearnedMappings()).toEqual({});
  });

  it('stores the first confirmation as count:1 (not yet trusted)', async () => {
    await saveLearnedMapping('example.com', 'firstname', 'personal.firstName');
    const mappings = await getLearnedMappings();
    expect(mappings['example.com']?.['firstname']).toEqual({ path: 'personal.firstName', count: 1 });
  });

  it('increments count on repeated same-path confirmation', async () => {
    await saveLearnedMapping('example.com', 'firstname', 'personal.firstName');
    await saveLearnedMapping('example.com', 'firstname', 'personal.firstName');
    const entry = (await getLearnedMappings())['example.com']?.['firstname'];
    expect(entry).toEqual({ path: 'personal.firstName', count: 2 });
  });

  it('resets to count:1 when a conflicting path is confirmed (new entry)', async () => {
    await saveLearnedMapping('example.com', 'firstname', 'personal.firstName');
    await saveLearnedMapping('example.com', 'firstname', 'personal.lastName');
    const entry = (await getLearnedMappings())['example.com']?.['firstname'];
    expect(entry).toEqual({ path: 'personal.lastName', count: 1 });
  });

  it('accumulates distinct signals across multiple saves', async () => {
    await saveLearnedMapping('example.com', 'firstname', 'personal.firstName');
    await saveLearnedMapping('example.com', 'email', 'personal.email');
    const mappings = await getLearnedMappings();
    expect(Object.keys(mappings['example.com'] ?? {})).toHaveLength(2);
  });

  it('leaves a legacy string entry untouched when same path is confirmed again', async () => {
    // Simulate old-format data already in storage (plain string, already trusted)
    store['learnedMappings'] = { 'example.com': { 'firstname': 'personal.firstName' } };
    await saveLearnedMapping('example.com', 'firstname', 'personal.firstName');
    const entry = (await getLearnedMappings())['example.com']?.['firstname'];
    expect(entry).toBe('personal.firstName'); // stays as legacy string
  });

  it('resets a legacy string entry to count:1 when a conflicting path is confirmed', async () => {
    store['learnedMappings'] = { 'example.com': { 'firstname': 'personal.firstName' } };
    await saveLearnedMapping('example.com', 'firstname', 'personal.lastName');
    const entry = (await getLearnedMappings())['example.com']?.['firstname'];
    expect(entry).toEqual({ path: 'personal.lastName', count: 1 });
  });

  it('stores the given label alongside the first confirmation', async () => {
    await saveLearnedMapping('example.com', 'firstname', 'personal.firstName', 'First Name');
    const entry = (await getLearnedMappings())['example.com']?.['firstname'];
    expect(entry).toEqual({ path: 'personal.firstName', count: 1, label: 'First Name' });
  });

  it('refreshes the label on a repeated same-path confirmation', async () => {
    await saveLearnedMapping('example.com', 'firstname', 'personal.firstName', 'First Name');
    await saveLearnedMapping('example.com', 'firstname', 'personal.firstName', 'Legal First Name');
    const entry = (await getLearnedMappings())['example.com']?.['firstname'];
    expect(entry).toEqual({ path: 'personal.firstName', count: 2, label: 'Legal First Name' });
  });

  it('keeps the existing label when a later confirmation omits one', async () => {
    await saveLearnedMapping('example.com', 'firstname', 'personal.firstName', 'First Name');
    await saveLearnedMapping('example.com', 'firstname', 'personal.firstName');
    const entry = (await getLearnedMappings())['example.com']?.['firstname'];
    expect(entry).toEqual({ path: 'personal.firstName', count: 2, label: 'First Name' });
  });

  it('upgrades a legacy string entry to the counted format when a label is provided for the same path', async () => {
    store['learnedMappings'] = { 'example.com': { 'firstname': 'personal.firstName' } };
    await saveLearnedMapping('example.com', 'firstname', 'personal.firstName', 'First Name');
    const entry = (await getLearnedMappings())['example.com']?.['firstname'];
    expect(entry).toEqual({ path: 'personal.firstName', count: 2, label: 'First Name' });
  });
});

describe('mergeLearnedMappings', () => {
  it('keeps a signal present only locally', () => {
    const local: LearnedMappings = { 'example.com': { 'firstname': { path: 'personal.firstName', count: 1 } } };
    const remote: LearnedMappings = {};
    expect(mergeLearnedMappings(local, remote)).toEqual(local);
  });

  it('keeps a signal present only remotely', () => {
    const local: LearnedMappings = {};
    const remote: LearnedMappings = { 'example.com': { 'firstname': { path: 'personal.firstName', count: 2 } } };
    expect(mergeLearnedMappings(local, remote)).toEqual(remote);
  });

  it('keeps the higher-count entry when the same signal conflicts', () => {
    const local: LearnedMappings = { 'example.com': { 'firstname': { path: 'personal.firstName', count: 1 } } };
    const remote: LearnedMappings = { 'example.com': { 'firstname': { path: 'personal.lastName', count: 2 } } };
    const merged = mergeLearnedMappings(local, remote);
    expect(merged['example.com']['firstname']).toEqual({ path: 'personal.lastName', count: 2 });
  });

  it('keeps the local entry on a count tie', () => {
    const local: LearnedMappings = { 'example.com': { 'firstname': { path: 'personal.firstName', count: 1, label: 'Local' } } };
    const remote: LearnedMappings = { 'example.com': { 'firstname': { path: 'personal.lastName', count: 1, label: 'Remote' } } };
    const merged = mergeLearnedMappings(local, remote);
    expect(merged['example.com']['firstname']).toEqual({ path: 'personal.firstName', count: 1, label: 'Local' });
  });

  it('a legacy string entry always outranks a counted entry, from either side', () => {
    const local: LearnedMappings = { 'example.com': { 'firstname': 'personal.firstName' } };
    const remote: LearnedMappings = { 'example.com': { 'firstname': { path: 'personal.lastName', count: 5 } } };
    expect(mergeLearnedMappings(local, remote)['example.com']['firstname']).toBe('personal.firstName');
    expect(mergeLearnedMappings(remote, local)['example.com']['firstname']).toBe('personal.firstName');
  });

  it('merges independently per domain, not just per top-level object', () => {
    const local: LearnedMappings = {
      'a.com': { 'x': { path: 'p1', count: 1 } },
    };
    const remote: LearnedMappings = {
      'b.com': { 'y': { path: 'p2', count: 1 } },
    };
    const merged = mergeLearnedMappings(local, remote);
    expect(Object.keys(merged).sort()).toEqual(['a.com', 'b.com']);
    expect(merged['a.com']['x']).toEqual({ path: 'p1', count: 1 });
    expect(merged['b.com']['y']).toEqual({ path: 'p2', count: 1 });
  });

  it('returns an empty object when both sides are empty', () => {
    expect(mergeLearnedMappings({}, {})).toEqual({});
  });
});

describe('Gemini settings', () => {
  it('returns null when no API key is stored', async () => {
    expect(await getGeminiApiKey()).toBeNull();
  });

  it('saves and retrieves a Gemini API key', async () => {
    await saveGeminiApiKey('my-key-123');
    expect(await getGeminiApiKey()).toBe('my-key-123');
  });

  it('clears the Gemini API key and model', async () => {
    await saveGeminiApiKey('my-key-123');
    await clearGeminiSettings();
    expect(await getGeminiApiKey()).toBeNull();
  });

  it('falls back to VITE_GEMINI_API_KEY in dev and persists it to storage', async () => {
    vi.stubEnv('VITE_GEMINI_API_KEY', 'dev-key-abc');
    expect(await getGeminiApiKey()).toBe('dev-key-abc');
    // Persisted so other contexts (content scripts/background, which never
    // see this env var directly) pick it up via the normal storage read.
    expect(store['geminiApiKey']).toBe('dev-key-abc');
    vi.unstubAllEnvs();
  });

  it('does not fall back to the dev key in production (DEV stubbed false)', async () => {
    vi.stubEnv('DEV', false);
    vi.stubEnv('VITE_GEMINI_API_KEY', 'dev-key-abc');
    expect(await getGeminiApiKey()).toBeNull();
    expect(store['geminiApiKey']).toBeUndefined();
    vi.unstubAllEnvs();
  });

  it('falls back to DEFAULT_GEMINI_MODEL when nothing is stored (dev) and persists it', async () => {
    const model = await getGeminiModel();
    expect(model).toBe('gemini-3.5-flash-lite'); // DEFAULT_GEMINI_MODEL / GEMINI_MODEL_PRIORITY[0]
    expect(store['geminiModel']).toBe('gemini-3.5-flash-lite');
  });

  it('returns null for the model in production when nothing is stored (DEV stubbed false)', async () => {
    vi.stubEnv('DEV', false);
    expect(await getGeminiModel()).toBeNull();
    expect(store['geminiModel']).toBeUndefined();
    vi.unstubAllEnvs();
  });

  it('saves and retrieves a Gemini model, taking priority over the dev default', async () => {
    await saveGeminiModel('gemini-3.6-flash');
    expect(await getGeminiModel()).toBe('gemini-3.6-flash');
  });
});

describe('theme preference', () => {
  it('returns "system" when no preference is stored', async () => {
    expect(await getThemePreference()).toBe('system');
  });

  it('saves and retrieves "dark"', async () => {
    await saveThemePreference('dark');
    expect(await getThemePreference()).toBe('dark');
  });

  it('saves and retrieves "light"', async () => {
    await saveThemePreference('light');
    expect(await getThemePreference()).toBe('light');
  });
});

describe('Drive token', () => {
  it('returns null when no token is stored', async () => {
    expect(await getDriveToken()).toBeNull();
  });

  it('saves and retrieves a Drive token', async () => {
    await saveDriveToken('token-abc');
    expect(await getDriveToken()).toBe('token-abc');
  });

  it('clears the Drive token', async () => {
    await saveDriveToken('token-abc');
    await clearDriveToken();
    expect(await getDriveToken()).toBeNull();
  });
});

describe('saveLearnedMapping failure propagation', () => {
  it('rejects when chrome.storage.local.set fails', async () => {
    const setSpy = vi
      .spyOn(chrome.storage.local, 'set')
      .mockImplementation((_items: Record<string, unknown>, cb: () => void) => {
        const runtime = chrome.runtime as { lastError: { message: string } | null };
        runtime.lastError = { message: 'QUOTA_BYTES exceeded' };
        cb();
        runtime.lastError = null;
      });

    await expect(
      saveLearnedMapping('example.com', 'firstname', 'personal.firstName'),
    ).rejects.toThrow('QUOTA_BYTES exceeded');

    setSpy.mockRestore();
  });
});

describe('storageGet/storageSet/storageRemove — synchronous throw from chrome.storage.local itself', () => {
  // Distinct from the chrome.runtime.lastError tests above: here
  // chrome.storage.local.get/set/remove throws synchronously (e.g. the API
  // is unavailable in this context) rather than calling back with an error.
  // storage.ts's set() rejects on failure (unlike sessionStorage.ts's, which
  // resolves silently) — the higher stakes here (profile data, not UI state)
  // is why callers need to know a save failed.
  it('storageGet (via getProfile) resolves to null when chrome.storage.local.get throws synchronously', async () => {
    vi.stubEnv('DEV', false);
    const original = chrome.storage.local.get;
    chrome.storage.local.get = () => { throw new Error('storage API unavailable'); };
    await expect(getProfile()).resolves.toBeNull();
    chrome.storage.local.get = original;
    vi.unstubAllEnvs();
  });

  it('storageSet (via saveProfile) rejects when chrome.storage.local.set throws synchronously', async () => {
    const original = chrome.storage.local.set;
    chrome.storage.local.set = () => { throw new Error('storage API unavailable'); };
    await expect(saveProfile(MINIMAL_PROFILE)).rejects.toThrow('storage API unavailable');
    chrome.storage.local.set = original;
  });

  it('storageRemove (via clearAllStorage) resolves when chrome.storage.local.remove throws synchronously', async () => {
    const original = chrome.storage.local.remove;
    chrome.storage.local.remove = () => { throw new Error('storage API unavailable'); };
    await expect(clearAllStorage()).resolves.toBeUndefined();
    chrome.storage.local.remove = original;
  });
});

describe('clearAllStorage', () => {
  it('removes profile, learnedMappings, and applicationHistory', async () => {
    // Seed all three keys, then confirm every one is removed.
    await saveProfile(MINIMAL_PROFILE);
    await saveLearnedMapping('example.com', 'firstname', 'personal.firstName');
    await saveApplicationHistory([
      { id: 'app-1', jobTitle: 'Dev', company: 'Acme', url: 'https://acme.example', appliedAt: '2026-01-01', status: 'applied' },
    ]);

    const removeSpy = vi.spyOn(chrome.storage.local, 'remove');

    await clearAllStorage();

    expect(removeSpy).toHaveBeenCalledWith(
      expect.arrayContaining(['profile', 'learnedMappings', 'applicationHistory']),
      expect.any(Function),
    );
    // DEV's dummy-profile fallback would otherwise mask storage genuinely
    // being empty here — stub it off to assert the real cleared state.
    vi.stubEnv('DEV', false);
    expect(await getProfile()).toBeNull();
    vi.unstubAllEnvs();
    expect(await getLearnedMappings()).toEqual({});
    expect(await getApplicationHistory()).toEqual([]);

    removeSpy.mockRestore();
  });
});
