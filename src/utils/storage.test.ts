import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';

// Mock chrome.storage.local before importing the module under test.
// We use a simple in-memory store so all helpers work together correctly.
const store: Record<string, unknown> = {};

vi.stubGlobal('chrome', {
  storage: {
    session: { set: (_items: Record<string, unknown>, callback: () => void) => callback() },
    local: {
      get(key: string | null, callback: (result: Record<string, unknown>) => void) {
        callback(key === null ? { ...store } : { [key]: store[key] });
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
  getGeminiApiKey, saveGeminiApiKey, clearGeminiSettings,
  getGeminiModel, saveGeminiModel, getGeminiSettings, saveGeminiSettings,
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
    expect(result?.salary.current!.period).toBe('monthly');
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

  it('keeps the local correction when an older backup has a higher count', () => {
    const local: LearnedMappings = { 'example.com': { 'firstname': { path: 'personal.firstName', count: 1 } } };
    const remote: LearnedMappings = { 'example.com': { 'firstname': { path: 'personal.lastName', count: 2 } } };
    const merged = mergeLearnedMappings(local, remote);
    expect(merged['example.com']['firstname']).toEqual({ path: 'personal.firstName', count: 1 });
  });

  it('keeps the local entry on a count tie', () => {
    const local: LearnedMappings = { 'example.com': { 'firstname': { path: 'personal.firstName', count: 1, label: 'Local' } } };
    const remote: LearnedMappings = { 'example.com': { 'firstname': { path: 'personal.lastName', count: 1, label: 'Remote' } } };
    const merged = mergeLearnedMappings(local, remote);
    expect(merged['example.com']['firstname']).toEqual({ path: 'personal.firstName', count: 1, label: 'Local' });
  });

  it('keeps the local decision rather than giving remote legacy entries unlimited trust', () => {
    const local: LearnedMappings = { 'example.com': { 'firstname': 'personal.firstName' } };
    const remote: LearnedMappings = { 'example.com': { 'firstname': { path: 'personal.lastName', count: 5 } } };
    expect(mergeLearnedMappings(local, remote)['example.com']['firstname']).toBe('personal.firstName');
    expect(mergeLearnedMappings(remote, local)['example.com']['firstname']).toEqual(remote['example.com'].firstname);
  });

  it('merges independently per domain, not just per top-level object', () => {
    const local: LearnedMappings = {
      'a.com': { 'x': { path: 'personal.firstName', count: 1 } },
    };
    const remote: LearnedMappings = {
      'b.com': { 'y': { path: 'personal.lastName', count: 1 } },
    };
    const merged = mergeLearnedMappings(local, remote);
    expect(Object.keys(merged).sort()).toEqual(['a.com', 'b.com']);
    expect(merged['a.com']['x']).toEqual({ path: 'personal.firstName', count: 1 });
    expect(merged['b.com']['y']).toEqual({ path: 'personal.lastName', count: 1 });
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
  });

  it('does not fall back to the dev key in production (DEV stubbed false)', async () => {
    vi.stubEnv('DEV', false);
    vi.stubEnv('VITE_GEMINI_API_KEY', 'dev-key-abc');
    expect(await getGeminiApiKey()).toBeNull();
    expect(store['geminiApiKey']).toBeUndefined();
  });

  it('seeds the development key and model together when explicitly configured', async () => {
    vi.stubEnv('VITE_GEMINI_API_KEY', 'dev-key-abc');
    const model = await getGeminiModel();
    expect(model).toBe('gemini-3.5-flash-lite'); // DEFAULT_GEMINI_MODEL / GEMINI_MODEL_PRIORITY[0]
    expect(store['geminiModel']).toBe('gemini-3.5-flash-lite');
  });

  it('returns null for the model in production when nothing is stored (DEV stubbed false)', async () => {
    vi.stubEnv('DEV', false);
    expect(await getGeminiModel()).toBeNull();
    expect(store['geminiModel']).toBeUndefined();
  });

  it('saves and retrieves a Gemini model, taking priority over the dev default', async () => {
    await saveGeminiModel('gemini-3.8-flash');
    expect(await getGeminiModel()).toBe('gemini-3.8-flash');
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
    vi.spyOn(chrome.storage.local, 'get').mockImplementation(() => { throw new Error('storage API unavailable'); });
    await expect(getProfile()).resolves.toBeNull();
  });

  it('storageSet (via saveProfile) rejects when chrome.storage.local.set throws synchronously', async () => {
    vi.spyOn(chrome.storage.local, 'set').mockImplementation(() => { throw new Error('storage API unavailable'); });
    await expect(saveProfile(MINIMAL_PROFILE)).rejects.toThrow('storage API unavailable');
  });

  it('reset rejects when chrome.storage.local.remove throws synchronously', async () => {
    await saveProfile(MINIMAL_PROFILE);
    vi.spyOn(chrome.storage.local, 'remove').mockImplementation(() => { throw new Error('storage API unavailable'); });
    await expect(clearAllStorage()).rejects.toThrow('storage API unavailable');
    expect((await getProfile())?.id).toBe(MINIMAL_PROFILE.id);
  });
});

describe('clearAllStorage', () => {
  it('retains the credential revision that rejects a key check started before reset', async () => {
    const { revision } = await getGeminiSettings();
    await clearGeminiSettings();
    const cleared = await getGeminiSettings();
    await clearAllStorage();
    expect((await getGeminiSettings()).revision).toBe(cleared.revision);
    expect(await saveGeminiSettings('stale-key', 'gemini-3.8-flash', 'auto', revision)).toBeNull();
    expect(await getGeminiApiKey()).toBeNull();
  });
  it('rejects a Chrome removal error and leaves the stored profile available', async () => {
    await saveProfile(MINIMAL_PROFILE);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(chrome.storage.local, 'remove').mockImplementation((_keys, callback) => {
      Object.assign(chrome.runtime, { lastError: { message: 'Removal failed' } });
      callback?.();
      Object.assign(chrome.runtime, { lastError: null });
    });
    await expect(clearAllStorage()).rejects.toThrow('Removal failed');
    expect((await getProfile())?.id).toBe(MINIMAL_PROFILE.id);
  });

  it('removes saved data and unknown retired keys while preserving development suppression', async () => {
    // Reset must also remove data left by older versions.
    await saveProfile(MINIMAL_PROFILE);
    await saveLearnedMapping('example.com', 'firstname', 'personal.firstName');
    Object.assign(store, { retiredFeatureData: ['obsolete'], geminiDevDisabled: true });

    const removeSpy = vi.spyOn(chrome.storage.local, 'remove');

    await clearAllStorage();

    expect(removeSpy).toHaveBeenCalledWith(
      expect.arrayContaining(['profile', 'learnedMappings', 'retiredFeatureData']),
      expect.any(Function),
    );
    // Reset suppresses the development fallback as well as removing stored data.
    expect(await getProfile()).toBeNull();
    expect(await getLearnedMappings()).toEqual({});

    expect(store.retiredFeatureData).toBeUndefined();
    expect(store.geminiDevDisabled).toBe(true);
    removeSpy.mockRestore();
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});


describe('Gemini reset and concurrent updates', () => {
  it('rejects removal failures rather than reporting a successful reset', async () => {
    await saveGeminiApiKey('synthetic-key');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(chrome.storage.local, 'remove').mockImplementation((_keys, callback) => {
      Object.assign(chrome.runtime, { lastError: { message: 'Removal failed' } });
      callback?.();
      Object.assign(chrome.runtime, { lastError: null });
    });
    await expect(clearGeminiSettings()).rejects.toThrow('Removal failed');
    expect(store.geminiApiKey).toBe('synthetic-key');
  });
  it('keeps the development key and model removed after reset and repeated reads', async () => {
    vi.stubEnv('DEV', true);
    vi.stubEnv('VITE_GEMINI_API_KEY', 'dev-key-abc');
    await getGeminiSettings();
    await clearGeminiSettings();
    await clearAllStorage();
    expect(await getGeminiApiKey()).toBeNull();
    expect(await getGeminiModel()).toBeNull();
    expect(await getGeminiApiKey()).toBeNull();
  });
  it('rejects a stale verified snapshot after another tab clears settings', async () => {
    const original = await getGeminiSettings();
    await clearGeminiSettings();
    expect(
      await saveGeminiSettings('old-key', 'gemini-3.8-flash', 'auto', original.revision),
    ).toBeNull();
    expect(await getGeminiApiKey()).toBeNull();
  });
  it('writes key, model and preference in a single atomic set', async () => {
    const original = await getGeminiSettings();
    const set = vi.spyOn(chrome.storage.local, 'set');
    const saved = await saveGeminiSettings(
      'verified-key',
      'gemini-3.8-flash',
      'auto',
      original.revision,
    );
    expect(saved?.apiKey).toBe('verified-key');
    expect(set).toHaveBeenCalledTimes(1);
    expect(set.mock.calls[0][0]).toMatchObject({
      geminiApiKey: 'verified-key',
      geminiModel: 'gemini-3.8-flash',
      geminiSettingsMeta: { preference: 'auto' },
    });
  });
  it('does not save when a check has been cancelled while waiting for storage', async () => {
    const original = await getGeminiSettings();
    expect(
      await saveGeminiSettings(
        'cancelled-key',
        'gemini-3.8-flash',
        'auto',
        original.revision,
        () => false,
      ),
    ).toBeNull();
    expect(store.geminiApiKey).toBeUndefined();
  });
  it('does not seed a development key after a failed read', async () => {
    vi.stubEnv('DEV', true);
    vi.stubEnv('VITE_GEMINI_API_KEY', 'dev-key-abc');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(chrome.storage.local, 'get').mockImplementation(() => {
      throw new Error('Storage unavailable');
    });
    await expect(getGeminiSettings()).rejects.toThrow('Storage unavailable');
    expect(store.geminiApiKey).toBeUndefined();
  });
});

it('restores the prior credential if a save is cancelled during the Chrome write', async () => {
  await saveGeminiApiKey('previous-key');
  const original = await getGeminiSettings();
  let completeWrite!: () => void;
  const originalSet = chrome.storage.local.set;
  vi.spyOn(chrome.storage.local, 'set')
    .mockImplementationOnce((items, callback) => {
      completeWrite = () => {
        Object.assign(store, items);
        callback?.();
      };
    })
    .mockImplementation(originalSet);
  let active = true;
  const pending = saveGeminiSettings(
    'cancelled-key',
    'gemini-3.8-flash',
    'auto',
    original.revision,
    () => active,
  );
  await vi.waitFor(() => expect(completeWrite).toBeDefined());
  active = false;
  completeWrite();
  expect(await pending).toBeNull();
  expect(await getGeminiApiKey()).toBe('previous-key');
});


it('serializes reset after a pending key write so credentials cannot return', async () => {
  const original = await getGeminiSettings();
  let finishWrite!: () => void;
  const originalSet = chrome.storage.local.set;
  vi.spyOn(chrome.storage.local, 'set').mockImplementationOnce((items, callback) => {
    finishWrite = () => { Object.assign(store, items); callback?.(); };
  }).mockImplementation(originalSet);
  const save = saveGeminiSettings('pending-key', 'gemini-3.8-flash', 'auto', original.revision);
  await vi.waitFor(() => expect(finishWrite).toBeDefined());
  const reset = clearGeminiSettings(); finishWrite();
  await Promise.all([save, reset]);
  expect(await getGeminiApiKey()).toBeNull(); expect(await getGeminiModel()).toBeNull();
});
