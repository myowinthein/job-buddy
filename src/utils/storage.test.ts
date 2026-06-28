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
  getLearnedMappings, saveLearnedMapping,
  getGeminiApiKey, saveGeminiApiKey, clearGeminiSettings,
  getThemePreference, saveThemePreference,
  getDriveToken, saveDriveToken, clearDriveToken,
  clearAllStorage,
} from './storage';
import type { Profile } from '../types/profile';

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
  it('returns null when no profile is stored', async () => {
    expect(await getProfile()).toBeNull();
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

describe('clearAllStorage', () => {
  it('removes profile, learnedMappings, and applicationHistory', async () => {
    await saveProfile(MINIMAL_PROFILE);
    await saveLearnedMapping('example.com', 'firstname', 'personal.firstName');
    await clearAllStorage();
    expect(await getProfile()).toBeNull();
    expect(await getLearnedMappings()).toEqual({});
  });
});
